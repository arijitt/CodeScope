// Token estimator + budget gate. Mirrors litecode's countTokens / canFit.
//
// We estimate tokens as ceil(chars / 4) which is the well-known GPT/BPE
// heuristic. Code biases slightly higher than prose (more punctuation), so
// for safety we add a 5% pad on anything that looks code-shaped. This is
// intentionally conservative — better to drop folder context than blow
// through the model's context window.

import type { BudgetBreakdown } from './types';

/** Hard per-call cap. Matches litecode's default 8k window. */
export const TOTAL_BUDGET = 8192;
/** Reserved for the model's reply. */
export const RESERVED_REPLY = 2000;
/** Soft cap on memory tokens (4 entries × ~85 ≈ 340; pad to 360). */
export const MEMORY_BUDGET = 360;
/** Soft cap on combined folder-context tokens. */
export const FOLDER_CTX_BUDGET = 1500;

const CODE_HINT_RE = /[{};=<>]/;

export function countTokens(text: string): number {
  if (!text) return 0;
  const base = Math.ceil(text.length / 4);
  // Crude code-density bump: if the chunk looks code-shaped, pad 5%.
  const looksCode = CODE_HINT_RE.test(text) && text.length > 40;
  return looksCode ? Math.ceil(base * 1.05) : base;
}

export interface FitInputs {
  systemPrompt: string;
  projectContext?: string;
  folderContext?: string;
  memory?: string;
  code: string;
}

/**
 * Apply litecode's priority-drop rules:
 *   1. Drop folder context first if over budget.
 *   2. Then drop memory.
 *   3. Caller is expected to swap full file for section-index code if still
 *      over budget; this helper does NOT mutate the code field.
 *
 * Returns the breakdown after drops; `fits=false` means the caller must
 * shrink `code` (e.g., load a section by file_analysis index).
 */
export function canFit(inp: FitInputs): BudgetBreakdown {
  const notes: string[] = [];
  let folder = inp.folderContext ?? '';
  let memory = inp.memory ?? '';

  const sys = countTokens(inp.systemPrompt);
  const proj = countTokens(inp.projectContext ?? '');
  let folderTok = countTokens(folder);
  let memTok = countTokens(memory);
  const code = countTokens(inp.code);

  const fixed = sys + RESERVED_REPLY + proj + code;
  let used = fixed + folderTok + memTok;

  if (used > TOTAL_BUDGET) {
    notes.push(`folder context dropped (was ~${folderTok} tokens)`);
    folder = '';
    folderTok = 0;
    used = fixed + memTok;
  }
  if (used > TOTAL_BUDGET) {
    notes.push(`memory dropped (was ~${memTok} tokens)`);
    memory = '';
    memTok = 0;
    used = fixed;
  }

  return {
    total: TOTAL_BUDGET,
    systemPrompt: sys,
    reservedReply: RESERVED_REPLY,
    memory: memTok,
    projectContext: proj,
    folderContext: folderTok,
    code,
    fits: used <= TOTAL_BUDGET,
    notes,
  };
}

/**
 * Available tokens for code given the rest of the prompt is already chosen.
 * Used by the executor to decide whether to load the full file or a section.
 */
export function availableForCode(inp: Omit<FitInputs, 'code'>): number {
  const sys = countTokens(inp.systemPrompt);
  const proj = countTokens(inp.projectContext ?? '');
  const folder = countTokens(inp.folderContext ?? '');
  const mem = countTokens(inp.memory ?? '');
  return Math.max(0, TOTAL_BUDGET - RESERVED_REPLY - sys - proj - folder - mem);
}
