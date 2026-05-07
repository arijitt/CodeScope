// Diff preview modal. Opens automatically when the orchestrator finishes
// and `agentStore.pendingEdits` is non-empty. User selects which edits to
// apply (default: all non-failed); applying calls
// `workspaceStore.applyAgentEdits()` and pushes a memory entry on success.

import { useMemo, useState } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';
import { useAgent } from '../../store/agentStore';
import { useWorkspace } from '../../store/workspaceStore';
import { hunksForExecutorEdit, diffStats } from '../../agent/diff';
import { pushMemory } from '../../agent/memory';
import type { DiffHunk, ExecutorEdit } from '../../agent/types';

function findOldContent(edit: ExecutorEdit): string {
  const ws = useWorkspace.getState();
  for (const id of ws.fileOrder) {
    const f = ws.files[id];
    if (f && f.path === edit.path) return f.content;
  }
  return '';
}

function HunksView({ hunks }: { hunks: DiffHunk[] }) {
  if (hunks.length === 0) {
    return <div className="muted" style={{ padding: 6 }}>(no content change)</div>;
  }
  return (
    <pre className="mono diff-pre">
      {hunks.map((h, i) => (
        <div key={i}>
          <div className="diff-hunk-header">@@ -{h.oldStart} +{h.newStart} @@</div>
          {h.lines.map((l, j) => (
            <div key={j} className={`diff-line diff-${l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : 'ctx'}`}>
              <span className="diff-gutter">{l.kind}</span>
              <span className="diff-text">{l.text || '\u00A0'}</span>
            </div>
          ))}
        </div>
      ))}
    </pre>
  );
}

export function DiffPreviewModal() {
  const pendingEdits = useAgent((s) => s.pendingEdits);
  const clearPendingEdits = useAgent((s) => s.clearPendingEdits);
  const setStatus = useAgent((s) => s.setStatus);
  const finish = useAgent((s) => s.finish);
  const log = useAgent((s) => s.log);
  const current = useAgent((s) => s.current);
  const applyAgentEdits = useWorkspace((s) => s.applyAgentEdits);

  // Per-file accept toggle. Default: all non-failed edits selected.
  const [accepted, setAccepted] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of pendingEdits) init[e.taskId] = !e.error;
    return init;
  });
  // When pendingEdits changes (new run), reset selection.
  useMemo(() => {
    const init: Record<string, boolean> = {};
    for (const e of pendingEdits) init[e.taskId] = !e.error;
    setAccepted(init);
  }, [pendingEdits]);

  const enrichedEdits = useMemo(() => pendingEdits.map((edit) => {
    const oldContent = findOldContent(edit);
    const hunks = edit.error ? [] : hunksForExecutorEdit(edit, oldContent);
    return { edit, oldContent, hunks, stats: diffStats(hunks) };
  }), [pendingEdits]);

  if (pendingEdits.length === 0) return null;

  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const failedCount = pendingEdits.filter((e) => !!e.error).length;

  const close = () => {
    clearPendingEdits();
    finish();
  };

  const applySelected = () => {
    setStatus('applying');
    const toApply = pendingEdits.filter((e) => accepted[e.taskId] && !e.error);
    if (toApply.length === 0) {
      log({ level: 'warn', message: 'Nothing selected — no edits applied.' });
      close();
      return;
    }
    const written = applyAgentEdits(toApply);
    log({ level: 'info', message: `Applied ${written.length} edit(s) to workspace.` });
    if (written.length > 0 && current?.plan && current.request) {
      pushMemory({
        request: current.request,
        synthesis: current.plan.synthesis,
        files: written,
      });
    }
    close();
  };

  const rejectAll = () => {
    log({ level: 'info', message: 'Rejected all proposed edits — workspace unchanged.' });
    close();
  };

  const toggle = (id: string) => setAccepted((m) => ({ ...m, [id]: !m[id] }));
  const acceptAll = () => {
    const next: Record<string, boolean> = {};
    for (const e of pendingEdits) next[e.taskId] = !e.error;
    setAccepted(next);
  };
  const deselectAll = () => {
    const next: Record<string, boolean> = {};
    for (const e of pendingEdits) next[e.taskId] = false;
    setAccepted(next);
  };

  return (
    <div className="diff-modal-overlay" role="dialog" aria-label="Review proposed edits">
      <div className="diff-modal">
        <div className="diff-modal-header">
          <strong>Review proposed edits</strong>
          <span className="muted" style={{ fontSize: '0.85em' }}>
            {pendingEdits.length} file(s) • {acceptedCount} selected{failedCount ? ` • ${failedCount} failed` : ''}
          </span>
          <span className="spacer" />
          <button onClick={acceptAll} title="Select all">Select all</button>
          <button onClick={deselectAll} title="Deselect all">Deselect all</button>
          <button onClick={close} title="Close (rejects everything)"><X size={14} /></button>
        </div>

        <div className="diff-modal-body scroll">
          {enrichedEdits.map(({ edit, hunks, stats }) => (
            <div key={edit.taskId} className="diff-card">
              <div className="diff-card-header row">
                <input
                  type="checkbox"
                  checked={!!accepted[edit.taskId]}
                  disabled={!!edit.error}
                  onChange={() => toggle(edit.taskId)}
                />
                <span className={`diff-op-badge diff-op-${edit.op}`}>{edit.op}</span>
                <span className="mono" style={{ fontSize: '0.95em' }}>
                  {edit.path}
                  {edit.newPath ? <> → {edit.newPath}</> : null}
                </span>
                {!edit.error && (
                  <span className="muted" style={{ fontSize: '0.85em' }}>
                    +{stats.added} −{stats.removed}
                  </span>
                )}
                <span className="spacer" />
                {edit.error && (
                  <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.9em' }}>
                    <AlertTriangle size={12} /> {edit.error}
                  </span>
                )}
              </div>
              {!edit.error && <HunksView hunks={hunks} />}
            </div>
          ))}
        </div>

        <div className="diff-modal-footer row">
          <button onClick={rejectAll}><X size={14} /> Reject all</button>
          <span className="spacer" />
          <button onClick={applySelected} className="primary" disabled={acceptedCount === 0}>
            <Check size={14} /> Apply {acceptedCount} selected
          </button>
        </div>
      </div>
    </div>
  );
}
