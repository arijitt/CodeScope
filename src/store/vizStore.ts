// Phase 6 — Visualization store.
// State machine + transport controls for the Run Viz pane.
// Phase 7 — Adds bidirectional cursor↔step binding via per-line index.

import { create } from 'zustand';
import type { VizCategory, VizPlan, VizStatus, VizTrace } from '../viz/types';
import { orchestrateVisualization } from '../viz/orchestrator';
import { useWorkspace } from './workspaceStore';
import { getLanguage } from '../lib/languages';
import { djb2 } from '../lib/hash';

const MIN_SPEED = 0.5;
const MAX_SPEED = 16;

/** Discrete zoom levels for the Run Visualization canvas. */
export const VIZ_ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const MIN_ZOOM = VIZ_ZOOM_LEVELS[0];
const MAX_ZOOM = VIZ_ZOOM_LEVELS[VIZ_ZOOM_LEVELS.length - 1];

interface VizState {
  status: VizStatus;
  plan: VizPlan | null;
  trace: VizTrace | null;
  /** 0..events.length (inclusive of the rendered "after step N" position). */
  currentStep: number;
  /** Steps per second for playback. */
  speed: number;
  /** When non-null, overrides the planner's category choice. */
  forceCategory: VizCategory | null;
  /** Visualization canvas zoom (1 = 100%). */
  zoom: number;
  error: string | null;
  cleanStdout: string;
  errorOutput: string;

  // ── Phase 7 ── cursor binding ────────────────────────────────────────
  /** When true, editor cursor ↔ viz step are kept in sync. */
  followCode: boolean;
  /** File the current trace was generated from. */
  vizFileId: string | null;
  /** Hash of the file content at visualize time (for stale detection). */
  vizSourceHash: string | null;
  /** True when the visualized file has been edited since visualize. */
  staleSource: boolean;
  /** Internal: sorted [line, step] pairs derived from trace.events. */
  _lineIndex: Array<[number, number]>;

  /** Internal: current AbortController for in-flight orchestrator. */
  _abort: AbortController | null;
  /** Internal: setInterval handle for playback. */
  _timer: number | null;

  // Actions
  setForceCategory(c: VizCategory | null): void;
  setSpeed(s: number): void;
  /** Set zoom to an absolute value (clamped to [MIN_ZOOM, MAX_ZOOM]). */
  setZoom(z: number): void;
  /** Snap to the next zoom level above the current zoom. */
  zoomIn(): void;
  /** Snap to the next zoom level below the current zoom. */
  zoomOut(): void;
  /** Restore zoom to 100%. */
  resetZoom(): void;
  startVisualize(): Promise<void>;
  cancel(): void;
  play(): void;
  pause(): void;
  step(delta: number): void;
  seek(step: number): void;
  reset(): void;
  resetAll(): void;

  // ── Phase 7 actions / queries ──
  setFollowCode(b: boolean): void;
  /** Mark the trace as stale (file was edited since visualize). */
  markStale(): void;
  /** Recompute staleSource flag against the live file content. */
  refreshStale(content: string): void;
  /**
   * Map a 1-based source line to a step index (0..events.length).
   * Returns the step *after* applying the last event whose line ≤ the
   * given line. Returns 0 when no events lie on/before the line.
   * Returns null when no trace is loaded or no events carry line tags.
   */
  stepFromLine(line: number): number | null;
  /**
   * Map a step index (0..events.length) to a source line.
   * Returns the line of the most recent applied event with a line tag,
   * or undefined for step 0 / events without tags.
   */
  lineForStep(step: number): number | undefined;
}

export const useViz = create<VizState>((set, get) => ({
  status: 'idle',
  plan: null,
  trace: null,
  currentStep: 0,
  speed: 2,
  forceCategory: null,
  zoom: 1,
  error: null,
  cleanStdout: '',
  errorOutput: '',
  followCode: true,
  vizFileId: null,
  vizSourceHash: null,
  staleSource: false,
  _lineIndex: [],
  _abort: null,
  _timer: null,

  setForceCategory: (c) => set({ forceCategory: c }),

  setSpeed: (s) => {
    const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));
    set({ speed });
    // If currently playing, restart the timer to apply the new speed.
    if (get().status === 'playing') {
      stopTimer(get);
      startTimer(set, get);
    }
  },

  setZoom: (z) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    set({ zoom });
  },

  zoomIn: () => {
    const cur = get().zoom;
    const next = VIZ_ZOOM_LEVELS.find((lvl) => lvl > cur + 1e-6);
    if (next !== undefined) set({ zoom: next });
  },

  zoomOut: () => {
    const cur = get().zoom;
    let prev: number | undefined;
    for (const lvl of VIZ_ZOOM_LEVELS) {
      if (lvl < cur - 1e-6) prev = lvl;
      else break;
    }
    if (prev !== undefined) set({ zoom: prev });
  },

  resetZoom: () => set({ zoom: 1 }),

  startVisualize: async () => {
    const ws = useWorkspace.getState();
    const id = ws.activeFileId;
    if (!id) {
      set({ status: 'error', error: 'Open a file first.' });
      return;
    }
    const file = ws.files[id];
    if (!file) {
      set({ status: 'error', error: 'No active file.' });
      return;
    }
    // Guard against re-entry.
    const cur = get().status;
    if (cur === 'planning' || cur === 'running' || cur === 'simulating') return;

    // Tear down any prior playback.
    stopTimer(get);

    const ac = new AbortController();
    set({
      status: 'planning',
      plan: null,
      trace: null,
      currentStep: 0,
      error: null,
      cleanStdout: '',
      errorOutput: '',
      // Capture the file id + content hash at planning time so stale-source
      // detection has a baseline. Reset stale flag on every fresh visualize.
      vizFileId: id,
      vizSourceHash: djb2(file.content),
      staleSource: false,
      _lineIndex: [],
      _abort: ac,
      _timer: null,
    });

    try {
      // Validate language is supported on Wandbox before bothering the planner;
      // unrunnable languages still work via simulator-only path.
      // (We just pass the LanguageId — getLanguage throws on unknown.)
      getLanguage(file.language);

      const result = await orchestrateVisualization({
        language: file.language,
        filename: file.path,
        code: file.content,
        forceCategory: get().forceCategory ?? undefined,
        signal: ac.signal,
        onPhase: (phase) => {
          // Only advance status if we haven't been cancelled in the meantime.
          if (get()._abort !== ac) return;
          set({ status: phase });
        },
      });

      // If cancelled mid-flight, ignore late results.
      if (get()._abort !== ac) return;

      set({
        status: 'ready',
        plan: result.plan,
        trace: result.trace,
        currentStep: 0,
        zoom: 1,
        cleanStdout: result.cleanStdout,
        errorOutput: result.errorOutput,
        _lineIndex: buildLineIndex(result.trace),
        _abort: null,
      });
    } catch (err) {
      if (get()._abort !== ac) return; // superseded
      const aborted = (err as Error)?.name === 'AbortError' || (err as Error)?.message === 'aborted';
      set({
        status: aborted ? 'cancelled' : 'error',
        error: aborted ? null : (err instanceof Error ? err.message : String(err)),
        _abort: null,
      });
    }
  },

  cancel: () => {
    const ac = get()._abort;
    if (ac) ac.abort();
    stopTimer(get);
    // Status transition handled by startVisualize's catch on AbortError.
    // If we were playing rather than orchestrating, just pause.
    if (!ac && get().status === 'playing') {
      set({ status: 'paused', _timer: null });
    }
  },

  play: () => {
    const { trace, status, currentStep } = get();
    if (!trace) return;
    if (status !== 'ready' && status !== 'paused') return;
    // If already at end, restart from 0.
    if (currentStep >= trace.events.length) set({ currentStep: 0 });
    set({ status: 'playing' });
    startTimer(set, get);
  },

  pause: () => {
    if (get().status !== 'playing') return;
    stopTimer(get);
    set({ status: 'paused', _timer: null });
  },

  step: (delta) => {
    const { trace } = get();
    if (!trace) return;
    if (get().status === 'playing') {
      stopTimer(get);
      set({ status: 'paused', _timer: null });
    }
    const next = clamp(get().currentStep + delta, 0, trace.events.length);
    set({ currentStep: next });
  },

  seek: (step) => {
    const { trace } = get();
    if (!trace) return;
    if (get().status === 'playing') {
      stopTimer(get);
      set({ status: 'paused', _timer: null });
    }
    set({ currentStep: clamp(step, 0, trace.events.length) });
  },

  reset: () => {
    if (get().status === 'playing') {
      stopTimer(get);
      set({ status: 'paused', _timer: null });
    }
    set({ currentStep: 0 });
    if (get().status === 'paused') set({ status: 'ready' });
  },

  resetAll: () => {
    const ac = get()._abort;
    if (ac) ac.abort();
    stopTimer(get);
    set({
      status: 'idle',
      plan: null,
      trace: null,
      currentStep: 0,
      zoom: 1,
      error: null,
      cleanStdout: '',
      errorOutput: '',
      vizFileId: null,
      vizSourceHash: null,
      staleSource: false,
      _lineIndex: [],
      _abort: null,
      _timer: null,
    });
  },

  setFollowCode: (b) => set({ followCode: b }),

  markStale: () => set({ staleSource: true }),

  refreshStale: (content) => {
    const { vizSourceHash, vizFileId } = get();
    if (!vizFileId || vizSourceHash === null) return;
    const cur = djb2(content);
    set({ staleSource: cur !== vizSourceHash });
  },

  stepFromLine: (line) => {
    const idx = get()._lineIndex;
    if (idx.length === 0) return null;
    // Binary search for the largest entry with entry[0] <= line.
    let lo = 0;
    let hi = idx.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (idx[mid][0] <= line) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) return 0; // cursor above first event line → initial state
    return idx[best][1];
  },

  lineForStep: (step) => {
    const trace = get().trace;
    if (!trace || step <= 0) return undefined;
    // Walk backwards from event[step-1] until we find one with a line tag.
    for (let i = Math.min(step, trace.events.length) - 1; i >= 0; i--) {
      const ln = trace.events[i].line;
      if (typeof ln === 'number' && ln > 0) return ln;
    }
    return undefined;
  },
}));

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function stopTimer(get: () => VizState): void {
  const t = get()._timer;
  if (t !== null) {
    clearInterval(t);
  }
}

function startTimer(set: (partial: Partial<VizState>) => void, get: () => VizState): void {
  const speed = get().speed;
  const intervalMs = Math.max(20, Math.round(1000 / speed));
  const handle = window.setInterval(() => {
    const { trace, currentStep, status } = get();
    if (!trace) { stopTimer(get); set({ _timer: null, status: 'ready' }); return; }
    if (status !== 'playing') { stopTimer(get); set({ _timer: null }); return; }
    if (currentStep >= trace.events.length) {
      stopTimer(get);
      set({ status: 'paused', _timer: null });
      return;
    }
    set({ currentStep: currentStep + 1 });
  }, intervalMs);
  set({ _timer: handle });
}

/**
 * Build a sorted [line, step] index for binary-search cursor → step lookup.
 * `step` is 1-based here (the step index AFTER applying that event), so
 * step N means "state after events[0..N-1] have been applied".
 *
 * Coalesces repeated lines: keeps the LATEST step for each line so cursor
 * landing on a loop body shows the most recent iteration's state.
 */
function buildLineIndex(trace: VizTrace): Array<[number, number]> {
  const map = new Map<number, number>();
  trace.events.forEach((ev, i) => {
    const ln = ev.line;
    if (typeof ln === 'number' && ln > 0) {
      map.set(ln, i + 1); // step AFTER applying this event
    }
  });
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

// Dev-only: expose the store on window for smoke tests / debugging.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __viz?: typeof useViz }).__viz = useViz;
}
