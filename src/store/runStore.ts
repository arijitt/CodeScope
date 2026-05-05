import { create } from 'zustand';
import type { RunResult } from '../types';

interface RunState {
  isRunning: boolean;
  result: RunResult | null;
  error: string | null;
  setRunning: (b: boolean) => void;
  setResult: (r: RunResult | null) => void;
  setError: (e: string | null) => void;
  clear: () => void;
}

export const useRun = create<RunState>((set) => ({
  isRunning: false,
  result: null,
  error: null,
  setRunning: (isRunning) => set({ isRunning }),
  setResult: (result) => set({ result, error: null }),
  setError: (error) => set({ error, result: null }),
  clear: () => set({ result: null, error: null }),
}));
