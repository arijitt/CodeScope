// Orchestrator: pure TS wave scheduler around the executor.
// - Topo-sort tasks by their declared deps.
// - Group into "waves" of mutually independent tasks.
// - Within a wave, run executors in parallel under a concurrency cap.
// - Between waves, await the previous wave so dependent tasks see fresh state.

import { execute } from './executor';
import type { ExecutorEdit, PlannerOutput, Task } from './types';

const DEFAULT_CONCURRENCY = 6;

function maxConcurrencyFromEnv(): number {
  const raw = (import.meta.env.VITE_AGENT_MAX_CONCURRENCY as string | undefined) ?? '';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 32 ? n : DEFAULT_CONCURRENCY;
}

function topoWaves(tasks: Task[]): Task[][] {
  const remaining = new Map(tasks.map((t) => [t.id, new Set(t.deps)]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waves: Task[][] = [];
  while (remaining.size > 0) {
    const ready: Task[] = [];
    for (const [id, deps] of remaining) {
      if (deps.size === 0) {
        const t = byId.get(id);
        if (t) ready.push(t);
      }
    }
    if (ready.length === 0) {
      // Cycle (planner already validates this, but defend in depth).
      throw new Error('Cyclic dependency in plan — cannot schedule.');
    }
    waves.push(ready);
    for (const t of ready) remaining.delete(t.id);
    for (const deps of remaining.values()) for (const r of ready) deps.delete(r.id);
  }
  return waves;
}

async function runWave(
  wave: Task[],
  concurrency: number,
  signal: AbortSignal | undefined,
  onProgress: (edit: ExecutorEdit) => void,
): Promise<ExecutorEdit[]> {
  const results: ExecutorEdit[] = new Array(wave.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  const slots = Math.max(1, Math.min(concurrency, wave.length));
  for (let i = 0; i < slots; i++) {
    workers.push((async () => {
      while (true) {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        const idx = next++;
        if (idx >= wave.length) return;
        const edit = await execute({ task: wave[idx], signal });
        results[idx] = edit;
        onProgress(edit);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}

export interface OrchestrateArgs {
  plan: PlannerOutput;
  signal?: AbortSignal;
  onTaskComplete?: (edit: ExecutorEdit) => void;
}

export async function orchestrate(args: OrchestrateArgs): Promise<ExecutorEdit[]> {
  const waves = topoWaves(args.plan.tasks);
  const concurrency = maxConcurrencyFromEnv();
  const all: ExecutorEdit[] = [];
  for (const wave of waves) {
    if (args.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const out = await runWave(wave, concurrency, args.signal, (e) => args.onTaskComplete?.(e));
    all.push(...out);
  }
  return all;
}
