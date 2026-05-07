// Prompt builder for the visualization planner and simulator.
// Documents the JSON contract, per-category vocab, and the __VIZ__: protocol.

import type { LanguageId } from '../types';
import type { VizCategory } from './types';
import { VIZ_CATEGORIES, VIZ_CATEGORY_LABELS } from './types';

const CATEGORY_VOCAB: Record<VizCategory, string> = {
  graph: `
SAMPLE INPUT shape:
  { "category": "graph",
    "data": { "nodes": [..ids..], "edges": [[from, to], ..],
              "directed": true|false, "start": <id>? } }
STEP OPS (emit as __VIZ__:{...}):
  { "t": "visit",          "node": <id> }
  { "t": "enqueue",        "node": <id> }
  { "t": "dequeue",        "node": <id> }
  { "t": "push",           "node": <id> }
  { "t": "pop",            "node": <id> }
  { "t": "set_state",      "node": <id>, "state": "idle"|"frontier"|"visiting"|"visited"|"done" }
  { "t": "highlight_edge", "from": <id>, "to": <id> }
  { "t": "set_distance",   "node": <id>, "distance": <int> }
  { "t": "note",           "text": "<one-line>" }`,
  tree: `
SAMPLE INPUT shape (a single root):
  { "category": "tree",
    "data": { "id": <id>, "value": <val>?,
              "children": [ { "id": ..., "value": ...?, "children": [...]? }, ... ] } }
STEP OPS:
  { "t": "enter",          "node": <id> }
  { "t": "leave",          "node": <id> }
  { "t": "visit",          "node": <id> }
  { "t": "set_state",      "node": <id>, "state": "idle"|"frontier"|"visiting"|"visited"|"done" }
  { "t": "highlight_edge", "from": <id>, "to": <id> }
  { "t": "set_value",      "node": <id>, "value": <val> }
  { "t": "note",           "text": "..." }`,
  array_sort: `
SAMPLE INPUT shape:
  { "category": "array_sort", "data": { "values": [int, ...] } }
STEP OPS (i, j are 0-based indices):
  { "t": "compare",         "i": <int>, "j": <int> }
  { "t": "swap",            "i": <int>, "j": <int> }
  { "t": "set",             "i": <int>, "v": <int> }
  { "t": "mark_sorted",     "i": <int> }
  { "t": "highlight_range", "lo": <int>, "hi": <int> }
  { "t": "pivot",           "i": <int> }
  { "t": "note",            "text": "..." }`,
  grid: `
SAMPLE INPUT shape:
  { "category": "grid",
    "data": { "rows": <int>, "cols": <int>,
              "walls": [[r,c], ..]?, "start": [r,c]?, "goal": [r,c]?,
              "values": [{"r":..,"c":..,"v":..}, ..]? } }
STEP OPS:
  { "t": "visit",          "r": <int>, "c": <int> }
  { "t": "set_state",      "r": <int>, "c": <int>, "state": "idle"|"frontier"|"visiting"|"visited"|"done" }
  { "t": "set_value",      "r": <int>, "c": <int>, "v": <num|str> }
  { "t": "highlight_path", "path": [[r,c], ..] }
  { "t": "note",           "text": "..." }`,
  linked_list: `
SAMPLE INPUT shape:
  { "category": "linked_list",
    "data": { "head": <id|null>,
              "nodes": [ { "id": ..., "value": ..., "next": <id|null> }, ... ] } }
STEP OPS:
  { "t": "visit",       "node": <id> }
  { "t": "set_pointer", "name": "head"|"slow"|"fast"|"prev"|"curr"|"...", "node": <id|null> }
  { "t": "set_next",    "node": <id>, "target": <id|null> }
  { "t": "insert",      "after": <id|null>, "node": { "id": ..., "value": ..., "next": <id|null>? } }
  { "t": "delete",      "node": <id> }
  { "t": "note",        "text": "..." }`,
  recursion_call_tree: `
SAMPLE INPUT shape:
  { "category": "recursion_call_tree", "data": { "rootCall": "fn(args)"? } }
STEP OPS (id is a stable integer per call frame; parent is the caller's id, or null at root):
  { "t": "call",      "id": <int>, "parent": <int|null>, "fn": "<name>", "args": "<repr>" }
  { "t": "return",    "id": <int>, "value": "<repr>" }
  { "t": "highlight", "id": <int> }
  { "t": "note",      "text": "..." }`,
  stack_queue: `
SAMPLE INPUT shape:
  { "category": "stack_queue", "data": { "show": ["stack"|"queue", ...] } }
STEP OPS:
  { "t": "push",    "struct": "stack",        "value": <num|str> }
  { "t": "pop",     "struct": "stack" }
  { "t": "enqueue", "struct": "queue",        "value": <num|str> }
  { "t": "dequeue", "struct": "queue" }
  { "t": "peek",    "struct": "stack"|"queue" }
  { "t": "note",    "text": "..." }`,
};

const CATEGORY_LIST = VIZ_CATEGORIES.join(' | ');

function formatVocab(only?: VizCategory): string {
  const cats = only ? [only] : (VIZ_CATEGORIES as readonly VizCategory[]);
  return cats.map(c => `### ${c} (${VIZ_CATEGORY_LABELS[c]})\n${CATEGORY_VOCAB[c].trim()}`).join('\n\n');
}

/**
 * System prompt for the **planner**: it must classify the code, generate a
 * sample input, and produce an instrumented copy of the source that prints
 * `__VIZ__:{json}` lines for every step op.
 */
export function buildPlannerPrompt(opts: {
  language: LanguageId;
  forceCategory?: VizCategory;
  maxEvents: number;
}): string {
  const { language, forceCategory, maxEvents } = opts;
  const vocabBlock = formatVocab(forceCategory);
  const catLine = forceCategory
    ? `The user has FORCED category = "${forceCategory}". Do not pick a different one.`
    : `Pick exactly ONE category from: ${CATEGORY_LIST}.`;

  return `You are the **Visualization Planner** for a browser IDE. Given the user's source code,
classify the algorithm into one of seven visualization categories, generate a small but
non-trivial sample input, and produce an INSTRUMENTED copy of the source that emits step
events on stdout for the renderer to animate.

${catLine}

## Output contract
Respond with ONE JSON object and NOTHING else (no prose, no fenced block):
{
  "category":          "<one of the categories>",
  "confidence":        <0..1>,
  "rationale":         "<one short sentence — what this code does>",
  "input": {
    "category": "<same as above>",
    "data":     <category-specific shape — see vocab below>
  },
  "instrumentedCode":  "<full ${language} source rewritten with probes>",
  "stdin":             "<exact stdin to pass when running, or empty string>"
}

## Probe protocol
The instrumented code MUST print one JSON object per step on its own line, prefixed
with the literal string \`__VIZ__:\` and followed by a newline.

Rules for the instrumented code:
  - Start by emitting the input echo: __VIZ__:{"t":"input","input":<the input.data shape>}
  - Then run the user's algorithm with probes inserted at the right spots.
  - Use ONLY the step ops listed for this category below.
  - JSON on each line must be COMPACT (no trailing newlines inside).
  - DO NOT print any other __VIZ__: lines outside the protocol.
  - Keep the program logic equivalent to the user's intent — do not "fix" their bugs.
  - Cap your probe emissions at ${maxEvents} events. If a loop would emit more, stop probing
    after that many and let the program continue silently.
  - The program MUST still compile and run on Wandbox; if needed, hardcode the sample
    input near the top so no stdin is required (return "" for "stdin").

## Category vocabularies
${vocabBlock}

Remember: respond with the JSON object only.`;
}

/**
 * System prompt for the **simulator** (fallback): given the source +
 * sampleInput + category, produce the VizEvent[] step trace directly,
 * without executing any code.
 */
export function buildSimulatorPrompt(opts: {
  category: VizCategory;
  maxEvents: number;
}): string {
  const { category, maxEvents } = opts;
  return `You are the **Visualization Simulator** (fallback). Real instrumented execution
failed, so you must produce the step-by-step event trace yourself by mentally
running the user's code on the provided sample input.

Respond with ONE JSON object and NOTHING else:
{
  "events": [ <step-op object>, <step-op object>, ... ]
}

Rules:
  - Use ONLY the step ops listed for the "${category}" category below.
  - Cap at ${maxEvents} events; if the trace would be longer, stop and append:
    {"t":"note","text":"trace truncated"}
  - JSON must parse with JSON.parse — no comments, no trailing commas.
  - Be faithful to the code's behavior on the given input. If the code has bugs,
    show what the code WOULD do, not what it should do.

## Vocabulary for "${category}"
${formatVocab(category)}`;
}

/** The literal probe prefix the runner scans for in stdout. */
export const VIZ_PROBE_PREFIX = '__VIZ__:';
