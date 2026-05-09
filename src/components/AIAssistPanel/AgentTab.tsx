// Agent tab: prompt input + Run/Cancel + live timeline. Drives a full
// planner → orchestrator → executor cycle and surfaces ExecutorEdits to
// the DiffPreviewModal mounted in AIAssistPanel.

import { useState } from 'react';
import { Play, X, Wand2, Loader2, History } from 'lucide-react';
import { useAgent } from '../../store/agentStore';
import { useAgentMemory } from '../../store/agentMemoryStore';
import { selectProvider } from '../../store/aiStore';
import { useAuth } from '../../lib/auth';
import { plan } from '../../agent/planner';
import { orchestrate } from '../../agent/orchestrator';
import { useComposerResize } from './useComposerResize';

export function AgentTab() {
  const status = useAgent((s) => s.status);
  const current = useAgent((s) => s.current);
  const logs = useAgent((s) => s.logs);
  const error = useAgent((s) => s.error);
  const startRun = useAgent((s) => s.startRun);
  const setStatus = useAgent((s) => s.setStatus);
  const setPlan = useAgent((s) => s.setPlan);
  const setPendingEdits = useAgent((s) => s.setPendingEdits);
  const setAbort = useAgent((s) => s.setAbort);
  const cancel = useAgent((s) => s.cancel);
  const fail = useAgent((s) => s.fail);
  const log = useAgent((s) => s.log);

  const memoryEntries = useAgentMemory((s) => s.entries);
  const clearMemory = useAgentMemory((s) => s.clear);

  const signedIn = useAuth((s) => s.signedIn);
  const provider = selectProvider();
  void signedIn;

  const [request, setRequest] = useState('');
  const composer = useComposerResize('codescope.agent.composerHeight', 72);

  const isRunning = status === 'planning' || status === 'executing';
  const canRun = provider !== 'none' && !isRunning && request.trim().length > 0;

  const onRun = async () => {
    if (!canRun) return;
    const req = request.trim();
    setRequest('');
    startRun(req);
    const ac = new AbortController();
    setAbort(ac);
    try {
      log({ level: 'info', message: 'Calling planner…' });
      const planned = await plan({ request: req, signal: ac.signal });
      setPlan(planned);
      setStatus('executing');
      log({ level: 'info', message: `Executing ${planned.tasks.length} task(s) in parallel waves…` });
      const edits = await orchestrate({
        plan: planned,
        signal: ac.signal,
        onTaskComplete: (e) => log({
          level: e.error ? 'error' : 'info',
          message: e.error
            ? `✗ ${e.path}: ${e.error}`
            : `✓ ${e.op} ${e.path}${e.newPath ? ` → ${e.newPath}` : ''}`,
        }),
      });
      setAbort(null);
      if (edits.length === 0) {
        log({ level: 'warn', message: 'Executor produced no edits.' });
        setStatus('idle');
        return;
      }
      setPendingEdits(edits); // → DiffPreviewModal opens via AIAssistPanel
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      fail(err instanceof Error ? err.message : String(err));
    }
  };

  const onCancel = () => cancel();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Memory chip */}
      <div className="row" style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)', fontSize: '0.85em', gap: 6 }}>
        <History size={12} />
        <span className="muted">Memory: {memoryEntries.length}/4</span>
        <span className="spacer" />
        {memoryEntries.length > 0 && (
          <button onClick={clearMemory} title="Clear agent memory" style={{ padding: '2px 6px', fontSize: '0.9em' }}>
            Clear
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.95em' }}>
        {!current && logs.length === 0 && (
          <div style={{ color: 'var(--fg-muted)', textAlign: 'center', marginTop: 12 }}>
            <Wand2 size={18} style={{ opacity: 0.5 }} />
            <div style={{ marginTop: 8 }}>
              Describe a multi-file change — the agent will plan, execute, and show you a diff before anything is written.
            </div>
            <div style={{ marginTop: 6, fontSize: '0.9em', opacity: 0.8 }}>
              e.g. "rename validateToken to verifyToken everywhere"
            </div>
          </div>
        )}
        {current && (
          <div className="ai-msg ai-msg-user">
            <div className="ai-msg-role">Request</div>
            <div className="ai-msg-body" style={{ whiteSpace: 'pre-wrap' }}>{current.request}</div>
          </div>
        )}
        {current?.plan && (
          <div className="ai-msg">
            <div className="ai-msg-role">Plan synthesis</div>
            <div className="ai-msg-body">{current.plan.synthesis}</div>
          </div>
        )}
        {logs.length > 0 && (
          <div className="agent-log mono" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: '0.85em' }}>
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.level === 'error' ? 'var(--danger)' : l.level === 'warn' ? 'var(--accent)' : 'var(--fg-muted)',
                whiteSpace: 'pre-wrap',
              }}>
                [{new Date(l.timestamp).toLocaleTimeString()}] {l.message}
              </div>
            ))}
          </div>
        )}
        {error && status === 'error' && (
          <div style={{ color: 'var(--danger)', padding: '4px 6px', whiteSpace: 'pre-wrap' }}>{error}</div>
        )}
      </div>

      {/* Composer */}
      <div
        className="composer-resizer"
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize · Double-click to reset"
        onPointerDown={composer.onPointerDown}
        onDoubleClick={composer.reset}
      />
      <div style={{ borderTop: '1px solid var(--border)', padding: 6, display: 'flex', gap: 6, alignItems: 'stretch', background: 'var(--bg-alt)', height: composer.height, flexShrink: 0 }}>
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void onRun();
            }
          }}
          placeholder={provider !== 'none' ? 'Describe a multi-file change… (Ctrl+Enter to run)' : 'Sign in or set API key'}
          disabled={provider === 'none' || isRunning}
          style={{
            flex: 1,
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '1em',
            background: 'var(--bg)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '6px 8px',
            minHeight: 0,
            height: '100%',
          }}
        />
        {isRunning ? (
          <button onClick={onCancel} title="Cancel run">
            <X size={14} /> Cancel
          </button>
        ) : (
          <button onClick={() => { void onRun(); }} disabled={!canRun} className="primary" title="Run agent (Ctrl+Enter)">
            <Play size={14} /> Run
          </button>
        )}
      </div>
    </div>
  );
}
