import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRun } from '../../store/runStore';
import { useWorkspace } from '../../store/workspaceStore';

type Tab = 'output' | 'input';

export function OutputPanel() {
  const { isRunning, result, error, clear } = useRun();
  const activeId = useWorkspace(s => s.activeFileId);
  const stdin = useWorkspace(s => (activeId ? s.stdinByFileId[activeId] ?? '' : ''));
  const setStdin = useWorkspace(s => s.setStdin);

  const [tab, setTab] = useState<Tab>('output');

  return (
    <section
      style={{
        background: 'var(--bg-panel)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        className="row"
        style={{
          padding: '0 6px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-alt)',
          gap: 0,
        }}
      >
        <button
          className={`bottom-tab ${tab === 'output' ? 'active' : ''}`}
          onClick={() => setTab('output')}
          title="Program output"
        >
          Output
        </button>
        <button
          className={`bottom-tab ${tab === 'input' ? 'active' : ''}`}
          onClick={() => setTab('input')}
          title="Program standard input (stdin)"
        >
          Input
        </button>
        <span style={{ marginLeft: 8 }}>
          {tab === 'output' && isRunning && <span className="muted">Running…</span>}
          {tab === 'output' && result && (
            <span className="muted">
              {result.language} {result.version} · exit {result.exitCode ?? '–'} · {result.timeMs}ms
            </span>
          )}
        </span>
        <span className="spacer" />
        {tab === 'output' && (
          <button onClick={clear} title="Clear output"><Trash2 size={12} /></button>
        )}
        {tab === 'input' && activeId && (
          <button onClick={() => setStdin(activeId, '')} title="Clear input" disabled={!stdin}>
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {tab === 'output' && (
        <div className="scroll mono" style={{ flex: 1, minHeight: 0, padding: 12, whiteSpace: 'pre-wrap', fontSize: '1em' }}>
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
          {!error && result && (
            <>
              {result.stdout && <span>{result.stdout}</span>}
              {result.stderr && <span style={{ color: 'var(--danger)' }}>{result.stderr}</span>}
              {!result.stdout && !result.stderr && <span className="muted">(no output)</span>}
            </>
          )}
          {!error && !result && !isRunning && <span className="muted">Press Run (Ctrl+Enter) to execute the active file.</span>}
        </div>
      )}

      {tab === 'input' && (
        <textarea
          value={stdin}
          onChange={(e) => activeId && setStdin(activeId, e.target.value)}
          disabled={!activeId}
          placeholder="Type stdin here. Each line is fed to your program when you press Run."
          spellCheck={false}
          className="mono"
          style={{
            flex: 1,
            minHeight: 0,
            resize: 'none',
            fontSize: '1em',
            background: 'var(--bg)',
            color: 'var(--fg)',
            border: 'none',
            outline: 'none',
            padding: 12,
          }}
        />
      )}
    </section>
  );
}
