import { FilePlus, Trash2, Edit3, Folder } from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';
import { getLanguage } from '../../lib/languages';

export function Sidebar() {
  const fileOrder = useWorkspace(s => s.fileOrder);
  const files = useWorkspace(s => s.files);
  const activeId = useWorkspace(s => s.activeFileId);
  const openTab = useWorkspace(s => s.openTab);
  const deleteFile = useWorkspace(s => s.deleteFile);
  const renameFile = useWorkspace(s => s.renameFile);
  const createFile = useWorkspace(s => s.createFile);

  const onNew = () => {
    // New file inherits the active file's language; falls back to JS.
    const active = activeId ? files[activeId] : null;
    const langId = active?.language ?? 'javascript';
    const lang = getLanguage(langId);
    const name = prompt('File name', lang.defaultFilename);
    if (!name) return;
    createFile(name, langId);
  };

  const onRename = (id: string, currentPath: string) => {
    const next = prompt('Rename to', currentPath);
    if (next && next.trim() !== '') renameFile(id, next.trim());
  };

  const onDelete = (id: string, path: string) => {
    if (confirm(`Delete "${path}"?`)) deleteFile(id);
  };

  return (
    <aside className="sidebar" style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column', fontSize: '1em' }}>
      <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', gap: 6 }}>
        <Folder size={16} />
        <strong style={{ flex: 1, fontSize: '1.05em' }}>Files</strong>
        <button onClick={onNew} title="New file" style={{ padding: '4px 8px' }}><FilePlus size={16} /></button>
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        {fileOrder.length === 0 && <div className="muted" style={{ padding: 10 }}>No files yet.</div>}
        {fileOrder.map(id => {
          const f = files[id];
          if (!f) return null;
          const isActive = id === activeId;
          return (
            <div
              key={id}
              onClick={() => openTab(id)}
              className="row"
              style={{
                padding: '7px 10px',
                gap: 6,
                cursor: 'pointer',
                background: isActive ? 'var(--bg)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              title={f.path}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onRename(id, f.path); }}
                title="Rename"
                style={{ padding: '4px 6px', border: 'none' }}
              ><Edit3 size={14} /></button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(id, f.path); }}
                title="Delete"
                style={{ padding: '4px 6px', border: 'none', color: 'var(--danger)' }}
              ><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
