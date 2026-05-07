// Planner: takes the user's plain-English request + workspace context map +
// short-term memory, asks the LLM for a structured task list. Strict JSON
// contract with one automatic retry on malformed output.

import { callProvider } from '../store/aiStore';
import { useAgentContext } from '../store/agentContextStore';
import { readMemory, formatMemoryBlock } from './memory';
import { canFit, TOTAL_BUDGET } from './tokens';
import type { ChatMessage } from '../lib/openai';
import type { PlannerOutput, Task } from './types';

const PLANNER_SYSTEM = `You are LiteCode's PLANNER stage running inside a browser-based IDE.

Given the user's request and the project context, produce a JSON object describing a plan.

You MUST respond with ONLY a JSON object (no prose, no markdown fences) matching this schema:

{
  "synthesis": "<one short sentence describing what the plan will do>",
  "tasks": [
    {
      "id": "<short unique id, e.g. t1>",
      "path": "<existing or new file path>",
      "newPath": "<only for rename ops>",
      "op": "edit" | "create" | "rename" | "delete",
      "hint": "<one sentence the executor will use to make the change>",
      "deps": ["<id of another task>", ...],
      "language": "<optional: javascript|typescript|python|...>"
    }
  ]
}

Rules:
- Every "id" must be unique within "tasks".
- "deps" must reference earlier task ids; circular deps are forbidden.
- Choose the SMALLEST set of files that satisfies the request.
- Prefer "edit" over "create"+"delete" pairs.
- Only emit "rename" when the user explicitly asks to rename a file.
- Do NOT include the file's content here — that is the executor's job.
- "synthesis" must be one short sentence in past tense (e.g. "Renamed validateToken to verifyToken across 3 files").
`;

function buildFolderContextBlock(folders: { folder: string; markdown: string }[]): string {
  if (folders.length === 0) return '';
  return folders.map((f) => f.markdown).join('\n\n');
}

function buildPlannerInstructions(opts: {
  projectContext: string;
  folderContext: string;
  memory: string;
}): string {
  const parts = [PLANNER_SYSTEM];
  if (opts.memory) parts.push(opts.memory);
  parts.push('## Project context\n\n' + opts.projectContext);
  if (opts.folderContext) parts.push('## Folder contexts\n\n' + opts.folderContext);
  return parts.join('\n\n');
}

function tryParse(raw: string): PlannerOutput | null {
  // Strip code fences if the model added them anyway.
  let s = raw.trim();
  if (s.startsWith('```')) {
    const end = s.lastIndexOf('```');
    s = s.replace(/^```(?:json)?\s*/i, '').slice(0, end - s.indexOf('\n') - 1).trim();
  }
  // Find the first {...} block to be tolerant of leading prose.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  const json = s.slice(first, last + 1);
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const synthesis = typeof obj.synthesis === 'string' ? obj.synthesis : '';
  const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : null;
  if (!rawTasks) return null;
  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  for (const t of rawTasks) {
    if (!t || typeof t !== 'object') return null;
    const tt = t as Record<string, unknown>;
    const id = typeof tt.id === 'string' && tt.id ? tt.id : `t${tasks.length + 1}`;
    if (seenIds.has(id)) return null;
    seenIds.add(id);
    const path = typeof tt.path === 'string' ? tt.path : '';
    if (!path) return null;
    const op = tt.op as Task['op'];
    if (op !== 'edit' && op !== 'create' && op !== 'rename' && op !== 'delete') return null;
    const hint = typeof tt.hint === 'string' ? tt.hint : '';
    const deps = Array.isArray(tt.deps) ? tt.deps.filter((d) => typeof d === 'string') as string[] : [];
    const newPath = typeof tt.newPath === 'string' ? tt.newPath : undefined;
    const language = typeof tt.language === 'string' ? tt.language as Task['language'] : undefined;
    if (op === 'rename' && !newPath) return null;
    tasks.push({ id, path, newPath, op, hint, deps, language });
  }
  // Validate deps reference existing ids and detect cycles.
  for (const t of tasks) {
    for (const d of t.deps) if (!seenIds.has(d)) return null;
  }
  if (hasCycle(tasks)) return null;
  return { synthesis: synthesis || `Planned ${tasks.length} change(s)`, tasks };
}

function hasCycle(tasks: Task[]): boolean {
  const map = new Map(tasks.map((t) => [t.id, t]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(tasks.map((t) => [t.id, WHITE]));
  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    const t = map.get(id);
    if (!t) return false;
    for (const d of t.deps) {
      const c = color.get(d);
      if (c === GRAY) return true;
      if (c === WHITE && visit(d)) return true;
    }
    color.set(id, BLACK);
    return false;
  };
  for (const t of tasks) if (color.get(t.id) === WHITE && visit(t.id)) return true;
  return false;
}

export interface PlanArgs {
  request: string;
  signal?: AbortSignal;
}

export async function plan(args: PlanArgs): Promise<PlannerOutput> {
  const ctx = useAgentContext.getState().getOrBuild();
  const memory = formatMemoryBlock(readMemory());
  const projectContext = ctx.project;
  let folderContext = buildFolderContextBlock(ctx.folders);

  // Apply budget gate. If even folder context can't fit, drop it.
  let breakdown = canFit({
    systemPrompt: PLANNER_SYSTEM,
    projectContext,
    folderContext,
    memory,
    code: args.request, // user request is the only "code" the planner sees
  });
  if (breakdown.notes.includes(`folder context dropped (was ~${breakdown.folderContext} tokens)`)) {
    folderContext = '';
  }
  if (!breakdown.fits) {
    // Last-ditch: drop folder context unconditionally.
    folderContext = '';
    breakdown = canFit({
      systemPrompt: PLANNER_SYSTEM,
      projectContext,
      folderContext: '',
      memory,
      code: args.request,
    });
  }
  if (!breakdown.fits) {
    throw new Error(`Planner prompt does not fit in ${TOTAL_BUDGET} tokens (request too large; try a smaller workspace).`);
  }

  const instructions = buildPlannerInstructions({
    projectContext,
    folderContext: folderContext ? buildFolderContextBlock(ctx.folders) : '',
    memory,
  });

  const messages: ChatMessage[] = [
    { role: 'user', content: `User request:\n\n${args.request}\n\nRespond with the JSON plan only.` },
  ];

  let raw = await callProvider({ instructions, messages, signal: args.signal });
  let parsed = tryParse(raw);
  if (!parsed) {
    // One retry with an explicit reminder.
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: raw },
      { role: 'user', content: 'Your previous response did not parse as JSON matching the schema. Respond ONLY with a valid JSON object — no prose, no markdown fences.' },
    ];
    raw = await callProvider({ instructions, messages: retryMessages, signal: args.signal });
    parsed = tryParse(raw);
  }
  if (!parsed) throw new Error('Planner returned malformed JSON twice. Aborting run.');
  return parsed;
}
