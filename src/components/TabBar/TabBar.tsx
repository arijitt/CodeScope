import { X } from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';

export function TabBar() {
  const tabs = useWorkspace(s => s.tabs);
  const files = useWorkspace(s => s.files);
  const activeId = useWorkspace(s => s.activeFileId);
  const setActive = useWorkspace(s => s.setActive);
  const closeTab = useWorkspace(s => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div
      className="scroll"
      style={{
        display: 'flex',
        background: 'var(--bg-alt)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {tabs.map(t => {
        const f = files[t.fileId];
        if (!f) return null;
        const active = t.fileId === activeId;
        return (
          <div
            key={t.fileId}
            onClick={() => setActive(t.fileId)}
            className="row"
            style={{
              padding: '6px 10px',
              gap: 6,
              cursor: 'pointer',
              background: active ? 'var(--tab-active)' : 'var(--tab-inactive)',
              borderRight: '1px solid var(--border)',
              borderTop: active ? '2px solid var(--accent)' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{f.path.split('/').pop()}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(t.fileId); }}
              title="Close"
              style={{ padding: '0 2px', border: 'none', lineHeight: 1 }}
            ><X size={12} /></button>
          </div>
        );
      })}
    </div>
  );
}
