// Thin wrapper around the dev-time auth broker (/auth/*).
// Surfaces the current Azure AD signed-in identity as a Zustand store.

import { create } from 'zustand';
import { clearTokenCache } from './foundry';

interface MeResponse {
  signedIn: boolean;
  upn?: string | null;
  name?: string | null;
  tenantId?: string | null;
  expiresOn?: number;
  error?: string;
}

interface AuthState {
  signedIn: boolean;
  upn: string | null;
  name: string | null;
  tenantId: string | null;
  expiresOn: number | null;
  isChecking: boolean;
  brokerAvailable: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  signedIn: false,
  upn: null,
  name: null,
  tenantId: null,
  expiresOn: null,
  isChecking: false,
  brokerAvailable: false,
  lastError: null,

  refresh: async () => {
    set({ isChecking: true });
    try {
      const res = await fetch('/auth/me');
      if (!res.ok) {
        set({ signedIn: false, brokerAvailable: false, isChecking: false, lastError: `broker /auth/me ${res.status}` });
        return;
      }
      const j = (await res.json()) as MeResponse;
      set({
        signedIn: !!j.signedIn,
        upn: j.upn ?? null,
        name: j.name ?? null,
        tenantId: j.tenantId ?? null,
        expiresOn: j.expiresOn ?? null,
        brokerAvailable: true,
        isChecking: false,
        lastError: j.signedIn ? null : (j.error ?? null),
      });
    } catch (err) {
      // Broker not reachable (production build, or VITE_DISABLE_FOUNDRY=1).
      set({
        signedIn: false,
        brokerAvailable: false,
        isChecking: false,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  signOut: async () => {
    try { await fetch('/auth/signout', { method: 'POST' }); } catch { /* ignore */ }
    clearTokenCache();
    set({ signedIn: false, upn: null, name: null, tenantId: null, expiresOn: null });
  },
}));

// Auto-refresh on first import so any consumer immediately sees the truth.
void useAuth.getState().refresh();
