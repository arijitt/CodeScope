import { Sparkles } from 'lucide-react';

export function RunVizPanel() {
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
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-alt)',
          gap: 8,
        }}
      >
        <Sparkles size={12} />
        <strong>Run Visualization</strong>
      </div>
      <div
        className="scroll"
        style={{
          flex: 1,
          minHeight: 0,
          padding: 16,
          color: 'var(--fg-muted)',
          fontSize: '1em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ marginBottom: 8 }}>Visualization will render here.</div>
          <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
            Provide stdin in the <strong>Input</strong> tab below, then press Run.
          </div>
        </div>
      </div>
    </section>
  );
}
