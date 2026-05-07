// Phase 6 — Visualization orchestrator.
// Pipeline:
//   plan (LLM) → run instrumented (Wandbox) → if no events, fallback to simulator (LLM)
// All legs share one AbortSignal so Cancel works mid-flight.

import { planVisualization } from './planner';
import { runInstrumented } from './runner';
import { simulateTrace } from './simulator';
import type { VizCategory, VizPlan, VizTrace } from './types';
import type { LanguageId } from '../types';

export interface OrchestrateOpts {
  language: LanguageId;
  filename: string;
  code: string;
  forceCategory?: VizCategory;
  signal?: AbortSignal;
  /** Status callback so the UI can show "planning…", "running…", etc. */
  onPhase?: (phase: 'planning' | 'running' | 'simulating') => void;
}

export interface OrchestrateResult {
  plan: VizPlan;
  trace: VizTrace;
  /** The user program's clean stdout (probe lines stripped). Empty in simulator mode. */
  cleanStdout: string;
  /** stderr / compile output from the instrumented run, if any. */
  errorOutput: string;
}

export async function orchestrateVisualization(opts: OrchestrateOpts): Promise<OrchestrateResult> {
  opts.onPhase?.('planning');
  const plan = await planVisualization({
    language: opts.language,
    code: opts.code,
    filename: opts.filename,
    forceCategory: opts.forceCategory,
    signal: opts.signal,
  });
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');

  // Try instrumented run first.
  opts.onPhase?.('running');
  const runResult = await runInstrumented(plan, opts.signal);
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');

  if (runResult.ranOk) {
    return {
      plan,
      trace: { events: runResult.events, truncated: runResult.truncated, simulated: false },
      cleanStdout: runResult.cleanStdout,
      errorOutput: runResult.errorOutput,
    };
  }

  // Fallback: ask the simulator for the trace.
  opts.onPhase?.('simulating');
  const sim = await simulateTrace({ plan, originalCode: opts.code, signal: opts.signal });
  return {
    plan,
    trace: { events: sim.events, truncated: sim.truncated, simulated: true },
    cleanStdout: runResult.cleanStdout,
    errorOutput: runResult.errorOutput,
  };
}
