// Phase 6 — Visualization runner.
// Executes the planner's instrumented source on Wandbox and parses
// __VIZ__:{json} lines from stdout into a typed VizEvent stream.

import { execute } from '../lib/wandbox';
import { getLanguage } from '../lib/languages';
import type { VizEvent, VizPlan } from './types';
import { VIZ_PROBE_PREFIX } from './prompts';

const DEFAULT_MAX_STEPS = 500;

export function getMaxSteps(): number {
  const raw = (import.meta.env.VITE_VIZ_MAX_STEPS as string | undefined) ?? '';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_STEPS;
  return Math.min(Math.max(n, 1), 5000);
}

export interface RunnerResult {
  events: VizEvent[];
  cleanStdout: string;
  exitCode: number | null;
  ranOk: boolean;
  truncated: boolean;
  /** Empty unless wandbox surfaced compile/runtime errors. */
  errorOutput: string;
}

/**
 * Run the instrumented program; collect __VIZ__:{json} probe lines.
 * Lines without the probe prefix are returned as `cleanStdout`.
 *
 * Never throws on Wandbox failure — instead returns ranOk=false so the
 * orchestrator can fall back to the LLM simulator.
 */
export async function runInstrumented(plan: VizPlan, signal?: AbortSignal): Promise<RunnerResult> {
  if (!plan.instrumentedCode) {
    return { events: [], cleanStdout: '', exitCode: null, ranOk: false, truncated: false, errorOutput: 'no instrumented code' };
  }
  const lang = getLanguage(plan.language);
  if (!lang.runnable || !lang.wandboxCompiler) {
    return { events: [], cleanStdout: '', exitCode: null, ranOk: false, truncated: false, errorOutput: `language ${lang.label} not runnable on Wandbox` };
  }

  let raw: { stdout: string; stderr: string; exitCode: number | null } | null = null;
  let errorOutput = '';
  try {
    const result = await execute({
      language: lang,
      code: plan.instrumentedCode,
      stdin: plan.stdin ?? '',
      signal,
    });
    raw = { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    if (result.stderr) errorOutput = result.stderr;
  } catch (err) {
    if (signal?.aborted) throw err;
    errorOutput = err instanceof Error ? err.message : String(err);
  }

  if (!raw) {
    return { events: [], cleanStdout: '', exitCode: null, ranOk: false, truncated: false, errorOutput };
  }

  const cap = getMaxSteps();
  const events: VizEvent[] = [];
  const cleanLines: string[] = [];
  let truncated = false;

  for (const line of raw.stdout.split(/\r?\n/)) {
    if (line.startsWith(VIZ_PROBE_PREFIX)) {
      if (events.length >= cap) {
        truncated = true;
        continue;
      }
      const json = line.slice(VIZ_PROBE_PREFIX.length).trim();
      if (!json) continue;
      try {
        const obj = JSON.parse(json);
        // Skip the input-echo line; the input is already in plan.input.
        if (obj && obj.t === 'input') continue;
        if (obj && typeof obj.t === 'string') events.push(obj as VizEvent);
      } catch {
        // ignore malformed probe line
      }
    } else if (line.length > 0 || cleanLines.length > 0) {
      cleanLines.push(line);
    }
  }

  // Drop trailing blank lines from cleanStdout.
  while (cleanLines.length && cleanLines[cleanLines.length - 1] === '') cleanLines.pop();

  const ranOk = events.length > 0 && (raw.exitCode === 0 || raw.exitCode === null);
  return {
    events,
    cleanStdout: cleanLines.join('\n'),
    exitCode: raw.exitCode,
    ranOk,
    truncated,
    errorOutput,
  };
}
