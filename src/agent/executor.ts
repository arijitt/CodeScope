// Executor: per-task LLM call. Loads the relevant file content (or a section
// of it via the analysis index when over budget), asks the model to produce
// the new full file contents, returns an ExecutorEdit ready for the diff
// preview modal.

import { callProvider } from '../store/aiStore';
import { useWorkspace } from '../store/workspaceStore';
import { useAgentContext } from '../store/agentContextStore';
import { readMemory, formatMemoryBlock } from './memory';
import { availableForCode, canFit } from './tokens';
import { loadSection } from './contextMap';
import { detectLanguageFromFilename, getLanguage } from '../lib/languages';
import type { ChatMessage } from '../lib/openai';
import type { ExecutorEdit, Task } from './types';
import type { LanguageId } from '../types';

const EXECUTOR_SYSTEM = `You are LiteCode's EXECUTOR stage. You will receive ONE task and the current contents of ONE file (or one section of it). Produce the NEW full contents of the file.

You MUST respond with ONLY a JSON object (no prose, no markdown fences) matching this schema:

{
  "content": "<the complete new file contents — or empty string for delete>"
}

Rules:
- For "edit": return the FULL new file contents, including unchanged lines.
- For "create": return the FULL contents of the new file.
- For "delete": return {"content": ""}.
- For "rename": if no content change is needed, return {"content": ""} and the rename will be applied as-is. If content also changes, return the NEW full contents.
- Preserve existing indentation style and trailing newlines.
- Do NOT wrap your response in markdown fences.
- If you were given a SECTION of a large file rather than the whole file, you MUST still return the full new file contents — you may assume the omitted ranges are unchanged and reproduce them verbatim using the line-range markers as guidance. (When in doubt, prefer to make minimal edits.)`;

function tryParseExecutor(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '');
    const end = s.lastIndexOf('```');
    if (end >= 0) s = s.slice(0, end);
    s = s.trim();
  }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const obj = JSON.parse(s.slice(first, last + 1));
    if (obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>).content === 'string') {
      return (obj as { content: string }).content;
    }
  } catch { /* fall through */ }
  return null;
}

export interface ExecuteArgs {
  task: Task;
  signal?: AbortSignal;
}

export async function execute(args: ExecuteArgs): Promise<ExecutorEdit> {
  const { task } = args;
  const ws = useWorkspace.getState();
  const existingFile = Object.values(ws.files).find((f) => f.path === task.path);

  // For delete + rename-without-content tasks we may not need the LLM at all.
  if (task.op === 'delete') {
    return { taskId: task.id, path: task.path, op: 'delete', content: '' };
  }
  if (task.op === 'rename' && !task.hint.toLowerCase().includes('content')) {
    return {
      taskId: task.id,
      path: task.path,
      newPath: task.newPath,
      op: 'rename',
      content: '',
    };
  }

  // Build executor prompt. Memory is included only if it fits.
  const ctx = useAgentContext.getState().getOrBuild();
  const memoryFull = formatMemoryBlock(readMemory());

  const baseInstructions = EXECUTOR_SYSTEM;
  const baseProj = ''; // executor doesn't need full project map; folder ctx for the file's folder is enough.

  // Folder context for the file's folder only.
  const folderOf = (p: string) => {
    const ix = p.lastIndexOf('/');
    return ix < 0 ? '' : p.slice(0, ix);
  };
  const folderCtx = ctx.folders.find((f) => f.folder === folderOf(task.path))?.markdown ?? '';

  // Decide how much room is left for the actual code content.
  let memory = memoryFull;
  let avail = availableForCode({
    systemPrompt: baseInstructions,
    projectContext: baseProj,
    folderContext: folderCtx,
    memory,
  });
  if (avail < 400 && memory) { memory = ''; avail = availableForCode({ systemPrompt: baseInstructions, projectContext: baseProj, folderContext: folderCtx, memory }); }

  // Resolve the code blob the model will see.
  let codeBlob = '';
  let lineRangeNote = '';
  if (existingFile) {
    const maxChars = Math.max(800, avail * 4); // tokens → chars, conservative
    if (existingFile.content.length <= maxChars) {
      codeBlob = existingFile.content;
    } else {
      const section = loadSection(existingFile, task.hint, maxChars);
      codeBlob = section.content;
      lineRangeNote = `\n\nNOTE: You are seeing only lines ${section.lineRange[0]}–${section.lineRange[1]} of the file (file is too large to fit). Other lines are unchanged — reproduce them verbatim by reading the markers.`;
    }
  }

  const finalCheck = canFit({
    systemPrompt: baseInstructions,
    projectContext: baseProj,
    folderContext: folderCtx,
    memory,
    code: codeBlob,
  });
  if (!finalCheck.fits) {
    return {
      taskId: task.id,
      path: task.path,
      newPath: task.newPath,
      op: task.op,
      content: existingFile?.content ?? '',
      error: 'File too large to fit in token budget even after section loading.',
    };
  }

  const instructions = [
    baseInstructions,
    memory && '## Recent agent memory\n\n' + memory,
    folderCtx && '## Folder context\n\n' + folderCtx,
  ].filter(Boolean).join('\n\n');

  const userParts: string[] = [];
  userParts.push(`Task id: ${task.id}`);
  userParts.push(`Operation: ${task.op}`);
  userParts.push(`Path: ${task.path}`);
  if (task.newPath) userParts.push(`New path: ${task.newPath}`);
  userParts.push(`Hint: ${task.hint}`);
  if (task.op === 'create') {
    userParts.push('\nThis is a NEW file. Provide the full contents.');
  } else if (existingFile) {
    const lang = getLanguage(existingFile.language).id;
    userParts.push(`\nCurrent file contents (${lang}):\n\`\`\`${lang}\n${codeBlob}\n\`\`\``);
    if (lineRangeNote) userParts.push(lineRangeNote);
  } else {
    // existingFile is null and op is edit/rename — the planner referenced a
    // file the workspace doesn't have. Surface as a per-task failure.
    return {
      taskId: task.id,
      path: task.path,
      op: task.op,
      content: '',
      error: `File "${task.path}" does not exist in the workspace.`,
    };
  }
  userParts.push('\nRespond with the JSON object described in the system prompt.');

  const messages: ChatMessage[] = [{ role: 'user', content: userParts.join('\n') }];

  let raw: string;
  try {
    raw = await callProvider({ instructions, messages, signal: args.signal });
  } catch (err) {
    return {
      taskId: task.id,
      path: task.path,
      newPath: task.newPath,
      op: task.op,
      content: existingFile?.content ?? '',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let content = tryParseExecutor(raw);
  if (content === null) {
    return {
      taskId: task.id,
      path: task.path,
      newPath: task.newPath,
      op: task.op,
      content: existingFile?.content ?? '',
      error: 'Executor returned malformed JSON.',
    };
  }

  // Resolve language for create ops.
  let language: LanguageId | undefined = task.language as LanguageId | undefined;
  if (task.op === 'create' && !language) language = detectLanguageFromFilename(task.path);

  return {
    taskId: task.id,
    path: task.path,
    newPath: task.newPath,
    op: task.op,
    content,
    language,
  };
}
