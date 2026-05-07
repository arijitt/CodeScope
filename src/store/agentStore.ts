// Agent state machine + run log. Drives the Agent tab UI.
// Pure UI/orchestration state; the actual planner/executor lives in src/agent/*.

import { create } from 'zustand';
import type {
  AgentLogEntry,
  AgentStatus,
  ExecutorEdit,
  PlannerOutput,
} from '../agent/types';

export interface AgentRun {
  request: string;
  startedAt: number;
  plan: PlannerOutput | null;
}

interface AgentState {
  status: AgentStatus;
  current: AgentRun | null;
  logs: AgentLogEntry[];
  /** Edits proposed by the executor wave; modal opens when this is non-empty. */
  pendingEdits: ExecutorEdit[];
  /** Active AbortController so the user can Cancel mid-run. */
  abort: AbortController | null;
  error: string | null;

  startRun: (request: string) => void;
  setStatus: (status: AgentStatus) => void;
  setPlan: (plan: PlannerOutput) => void;
  setPendingEdits: (edits: ExecutorEdit[]) => void;
  clearPendingEdits: () => void;
  log: (entry: Omit<AgentLogEntry, 'timestamp'>) => void;
  setAbort: (a: AbortController | null) => void;
  cancel: () => void;
  fail: (msg: string) => void;
  finish: () => void;
  reset: () => void;
}

export const useAgent = create<AgentState>()((set, get) => ({
  status: 'idle',
  current: null,
  logs: [],
  pendingEdits: [],
  abort: null,
  error: null,

  startRun: (request) => set({
    status: 'planning',
    current: { request, startedAt: Date.now(), plan: null },
    logs: [{ timestamp: Date.now(), level: 'info', message: `Run started: "${request}"` }],
    pendingEdits: [],
    error: null,
  }),

  setStatus: (status) => set({ status }),

  setPlan: (plan) => set((s) => ({
    current: s.current ? { ...s.current, plan } : s.current,
    logs: [
      ...s.logs,
      {
        timestamp: Date.now(),
        level: 'info',
        message: `Plan: ${plan.tasks.length} task(s) — ${plan.synthesis}`,
      },
    ],
  })),

  setPendingEdits: (edits) => set({ pendingEdits: edits, status: 'previewing' }),
  clearPendingEdits: () => set({ pendingEdits: [] }),

  log: (entry) => set((s) => ({
    logs: [...s.logs, { ...entry, timestamp: Date.now() }].slice(-200),
  })),

  setAbort: (abort) => set({ abort }),

  cancel: () => {
    const a = get().abort;
    if (a) a.abort();
    set({
      status: 'cancelled',
      abort: null,
      logs: [...get().logs, { timestamp: Date.now(), level: 'warn', message: 'Cancelled by user' }],
    });
  },

  fail: (msg) => set((s) => ({
    status: 'error',
    error: msg,
    abort: null,
    logs: [...s.logs, { timestamp: Date.now(), level: 'error', message: msg }],
  })),

  finish: () => set((s) => ({
    status: 'idle',
    abort: null,
    logs: [...s.logs, { timestamp: Date.now(), level: 'info', message: 'Run complete.' }],
  })),

  reset: () => set({
    status: 'idle',
    current: null,
    logs: [],
    pendingEdits: [],
    abort: null,
    error: null,
  }),
}));
