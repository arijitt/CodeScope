// Phase 6 — Visualization store.
// State machine + transport controls for the Run Viz pane.

import { create } from 'zustand';
import type { VizCategory, VizPlan, VizStatus, VizTrace } from '../viz/types';
import { orchestrateVisualization } from '../viz/orchestrator';
import { useWorkspace } from './workspaceStore';
import { getLanguage } from '../lib/languages';

const MIN_SPEED = 0.5;
const MAX_SPEED = 16;

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
  error: string | null;
  cleanStdout: string;
  errorOutput: string;
  /** Internal: current AbortController for in-flight orchestrator. */
  _abort: AbortController | null;
  /** Internal: setInterval handle for playback. */
  _timer: number | null;

  // Actions
  setForceCategory(c: VizCategory | null): void;
  setSpeed(s: number): void;
  startVisualize(): Promise<void>;
  cancel(): void;
  play(): void;
  pause(): void;
  step(delta: number): void;
  seek(step: number): void;
  reset(): void;
  resetAll(): void;
}

export const useViz = create<VizState>((set, get) => ({
  status: 'idle',
  plan: null,
  trace: null,
  currentStep: 0,
  speed: 2,
  forceCategory: null,
  error: null,
  cleanStdout: '',
  errorOutput: '',
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
        cleanStdout: result.cleanStdout,
        errorOutput: result.errorOutput,
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
      error: null,
      cleanStdout: '',
      errorOutput: '',
      _abort: null,
      _timer: null,
    });
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
