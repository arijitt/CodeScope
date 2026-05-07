// In-memory cache for the litecode-style context map.
// Keyed by a stable hash of the workspace; rebuilt lazily on first read after
// any workspace mutation that changes the hash.

import { create } from 'zustand';
import { useWorkspace } from './workspaceStore';
import { buildContextMap, type ContextMap } from '../agent/contextMap';

interface AgentContextState {
  map: ContextMap | null;
  /** Returns a context map built from the current workspace, using cache when possible. */
  getOrBuild: () => ContextMap;
  invalidate: () => void;
}

export const useAgentContext = create<AgentContextState>()((set, get) => ({
  map: null,
  getOrBuild: () => {
    const ws = useWorkspace.getState();
    const files = ws.fileOrder.map((id) => ws.files[id]).filter(Boolean);
    const cached = get().map;
    const fresh = buildContextMap(files);
    if (cached && cached.hash === fresh.hash) return cached;
    set({ map: fresh });
    return fresh;
  },
  invalidate: () => set({ map: null }),
}));

// Subscribe to workspace mutations: invalidate the cache whenever files
// change. The store will rebuild on the next read.
useWorkspace.subscribe((state, prev) => {
  if (state.files !== prev.files || state.fileOrder !== prev.fileOrder) {
    useAgentContext.getState().invalidate();
  }
});
