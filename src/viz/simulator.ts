// Phase 6 — Visualization simulator (fallback).
// When real instrumentation fails (compile error, no probes emitted, etc.)
// ask the LLM directly for the VizEvent[] step trace.

import { callProvider } from '../store/aiStore';
import { buildSimulatorPrompt } from './prompts';
import { getMaxSteps } from './runner';
import type { VizEvent, VizPlan } from './types';

export class SimulatorError extends Error {
  raw?: string;
  constructor(message: string, raw?: string) {
    super(message);
    this.name = 'SimulatorError';
    this.raw = raw;
  }
}

interface SimulatorOpts {
  plan: VizPlan;
  /** The user's *original* source — not the instrumented copy. */
  originalCode: string;
  signal?: AbortSignal;
}

export async function simulateTrace(opts: SimulatorOpts): Promise<{ events: VizEvent[]; truncated: boolean }> {
  const { plan, originalCode, signal } = opts;
  const cap = getMaxSteps();
  const instructions = buildSimulatorPrompt({ category: plan.category, maxEvents: cap });

  const userMsg = `Category: ${plan.category}
Sample input (already chosen by planner):
\`\`\`json
${JSON.stringify(plan.input.data, null, 2)}
\`\`\`

User's source (run this mentally on the input above):
\`\`\`${plan.language}
${originalCode.length > 7000 ? originalCode.slice(0, 7000) + '\n...[truncated]' : originalCode}
\`\`\`

Produce the JSON object now.`;

  let raw = await callProvider({ instructions, messages: [{ role: 'user', content: userMsg }], signal });
  let parsed = safeParse(raw);
  if (!parsed) {
    raw = await callProvider({
      instructions: instructions + '\n\nIMPORTANT: previous reply was not valid JSON. Respond with ONLY the JSON object.',
      messages: [{ role: 'user', content: userMsg }],
      signal,
    });
    parsed = safeParse(raw);
  }
  if (!parsed || typeof parsed !== 'object') throw new SimulatorError('Simulator did not return valid JSON.', raw);

  const events = (parsed as Record<string, unknown>).events;
  if (!Array.isArray(events)) throw new SimulatorError('Simulator JSON missing events[].', raw);

  let truncated = false;
  const out: VizEvent[] = [];
  for (const ev of events) {
    if (ev && typeof ev === 'object' && typeof (ev as Record<string, unknown>).t === 'string') {
      if (out.length >= cap) { truncated = true; break; }
      out.push(ev as VizEvent);
    }
  }
  return { events: out, truncated };
}

function safeParse(text: string): unknown | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1] : text;
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}
