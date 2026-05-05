import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, RefreshCw, User2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../lib/auth';

interface AuthChipProps {
  variant?: 'toolbar' | 'panel';
}

function initials(name: string | null): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // user@domain → "us"; "First Last" → "FL"
  const atIndex = trimmed.indexOf('@');
  const local = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return trimmed.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AuthChip({ variant = 'toolbar' }: AuthChipProps) {
  const signedIn = useAuth(s => s.signedIn);
  const upn = useAuth(s => s.upn);
  const name = useAuth(s => s.name);
  const isChecking = useAuth(s => s.isChecking);
  const brokerAvailable = useAuth(s => s.brokerAvailable);
  const lastError = useAuth(s => s.lastError);
  const refresh = useAuth(s => s.refresh);
  const signOut = useAuth(s => s.signOut);

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const display = name ?? upn ?? null;
  const isToolbar = variant === 'toolbar';

  const baseStyle: React.CSSProperties = isToolbar
    ? { height: 44, padding: '0 12px', borderRadius: 22 }
    : { height: 30, padding: '0 10px', borderRadius: 15, fontSize: '0.9em' };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="row"
        onClick={() => setOpen(o => !o)}
        title={signedIn ? `Signed in as ${display ?? 'unknown'}` : 'Not signed in to Azure'}
        style={{
          ...baseStyle,
          gap: 8,
          background: signedIn ? 'var(--bg-panel)' : 'var(--bg-alt)',
          border: '1px solid var(--border)',
          color: 'var(--fg)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <span
          aria-hidden
          style={{
            width: isToolbar ? 28 : 22,
            height: isToolbar ? 28 : 22,
            borderRadius: '50%',
            background: signedIn ? 'var(--accent, #0a84ff)' : 'var(--border)',
            color: signedIn ? '#fff' : 'var(--fg-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isToolbar ? 12 : 10,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {signedIn ? initials(display) : <User2 size={isToolbar ? 14 : 12} />}
        </span>
        {isToolbar && (
          <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {signedIn ? (display ?? 'Signed in') : 'Sign in'}
          </span>
        )}
        <ChevronDown size={isToolbar ? 16 : 12} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 6,
            minWidth: 260,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 1000,
            fontSize: '0.95em',
          }}
        >
          <div style={{ padding: '4px 6px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600 }}>
              {signedIn ? 'Azure (Foundry)' : brokerAvailable ? 'Not signed in' : 'Auth broker unavailable'}
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: '0.9em', wordBreak: 'break-all' }}>
              {signedIn ? (display ?? '') : (lastError ?? 'No DefaultAzureCredential found.')}
            </div>
          </div>

          {!signedIn && brokerAvailable && (
            <div style={{ padding: '8px 6px', color: 'var(--fg-muted)', fontSize: '0.9em' }}>
              Run this in your terminal, then click Refresh:
              <pre className="mono" style={{ background: 'var(--bg-alt)', padding: 8, borderRadius: 4, marginTop: 6 }}>
az login --tenant common
              </pre>
            </div>
          )}

          {!brokerAvailable && (
            <div style={{ padding: '8px 6px', color: 'var(--fg-muted)', fontSize: '0.9em' }}>
              The dev-time broker is reachable only in <code>npm run dev</code>. Set <code>VITE_OPENAI_API_KEY</code> for an OpenAI fallback.
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => { void refresh(); }}
              disabled={isChecking}
              className="row"
              style={{ gap: 6, padding: '6px 10px' }}
              title="Re-check Azure credentials"
            >
              <RefreshCw size={14} className={isChecking ? 'spin' : ''} /> Refresh
            </button>
            {signedIn ? (
              <button
                type="button"
                onClick={() => { void signOut().then(() => setOpen(false)); }}
                className="row"
                style={{ gap: 6, padding: '6px 10px' }}
                title="Clear cached token in the dev broker"
              >
                <LogOut size={14} /> Sign out
              </button>
            ) : (
              brokerAvailable && (
                <button
                  type="button"
                  onClick={() => { void refresh(); }}
                  className="row primary"
                  style={{ gap: 6, padding: '6px 10px' }}
                  title="After running az login, click to refresh"
                >
                  <LogIn size={14} /> Sign in
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
