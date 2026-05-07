// Persisted ring buffer of the last 4 agent actions.
// Mirrors litecode v1.1's .litecode/memory.json — but lives in localStorage
// instead of disk because we have no real filesystem in the browser.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MemoryEntry } from '../agent/types';

const RING_SIZE = 4;

interface AgentMemoryState {
  entries: MemoryEntry[];
  push: (entry: Omit<MemoryEntry, 'timestamp'>) => void;
  clear: () => void;
}

export const useAgentMemory = create<AgentMemoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      push: (entry) => {
        const next = [
          ...get().entries,
          { ...entry, timestamp: Date.now() },
        ].slice(-RING_SIZE);
        set({ entries: next });
      },
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'web-ide.agent.memory.v1',
      version: 1,
      partialize: (s) => ({ entries: s.entries.slice(-RING_SIZE) }),
    }
  )
);
