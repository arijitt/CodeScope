// Phase 6 — Visualization planner.
// Calls the LLM (Foundry → OpenAI via callProvider) to classify the user's
// code into one of the seven viz categories, generate a sample input, and
// emit an instrumented copy of the source that prints __VIZ__:{json} probes.

import { callProvider } from '../store/aiStore';
import { buildPlannerPrompt } from './prompts';
import { getMaxSteps } from './runner';
import { VIZ_CATEGORIES, type VizCategory, type VizPlan } from './types';
import type { LanguageId } from '../types';

export class PlannerError extends Error {
  raw?: string;
  constructor(message: string, raw?: string) {
    super(message);
    this.name = 'PlannerError';
    this.raw = raw;
  }
}

interface PlannerOpts {
  language: LanguageId;
  code: string;
  filename: string;
  forceCategory?: VizCategory;
  signal?: AbortSignal;
}

/**
 * Ask the planner; one retry on malformed JSON.
 */
export async function planVisualization(opts: PlannerOpts): Promise<VizPlan> {
  const instructions = buildPlannerPrompt({
    language: opts.language,
    forceCategory: opts.forceCategory,
    maxEvents: getMaxSteps(),
  });
  const userMsg = buildUserMessage(opts);

  let raw = await callProvider({
    instructions,
    messages: [{ role: 'user', content: userMsg }],
    signal: opts.signal,
  });

  let parsed = safeParse(raw);
  if (!parsed) {
    // One retry — append a stricter reminder.
    raw = await callProvider({
      instructions: instructions + '\n\nIMPORTANT: your previous reply did not parse as JSON. Respond with ONLY the JSON object — no prose, no markdown fence.',
      messages: [{ role: 'user', content: userMsg }],
      signal: opts.signal,
    });
    parsed = safeParse(raw);
  }
  if (!parsed) throw new PlannerError('Planner did not return valid JSON.', raw);

  return validatePlan(parsed, opts.language, opts.forceCategory);
}

function buildUserMessage(opts: PlannerOpts): string {
  const cap = 8000;
  const code = opts.code.length > cap ? opts.code.slice(0, cap) + '\n... [truncated] ...' : opts.code;
  const force = opts.forceCategory ? `\nForced category: ${opts.forceCategory}` : '';
  return `File: ${opts.filename}
Language: ${opts.language}${force}

Source:
\`\`\`${opts.language}
${code}
\`\`\``;
}

function safeParse(text: string): unknown | null {
  if (!text) return null;
  // Strip a markdown fence if the model still wrapped it.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1] : text;
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  // Try to recover the first {...} block.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

function validatePlan(parsed: unknown, language: LanguageId, force?: VizCategory): VizPlan {
  if (!parsed || typeof parsed !== 'object') throw new PlannerError('Plan is not an object.');
  const p = parsed as Record<string, unknown>;
  const category = String(p.category ?? '');
  if (!VIZ_CATEGORIES.includes(category as VizCategory)) {
    throw new PlannerError(`Plan category "${category}" is not one of ${VIZ_CATEGORIES.join('|')}.`);
  }
  if (force && force !== category) {
    throw new PlannerError(`Planner ignored forceCategory="${force}" (returned "${category}").`);
  }
  if (!p.input || typeof p.input !== 'object') throw new PlannerError('Plan missing input.');
  const input = p.input as Record<string, unknown>;
  if (input.category !== category) {
    // tolerate: align them
    input.category = category;
  }
  if (!('data' in input)) throw new PlannerError('Plan input missing data.');

  const plan: VizPlan = {
    category: category as VizCategory,
    confidence: typeof p.confidence === 'number' ? p.confidence : undefined,
    language,
    input: {
      category: category as VizCategory,
      data: (input.data as VizPlan['input']['data']),
    } as VizPlan['input'],
    instrumentedCode: typeof p.instrumentedCode === 'string' ? p.instrumentedCode : undefined,
    stdin: typeof p.stdin === 'string' ? p.stdin : '',
    rationale: typeof p.rationale === 'string' ? p.rationale : undefined,
  };
  return plan;
}
