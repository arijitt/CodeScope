import { useWorkspace } from '../../store/workspaceStore';
import { useSettings } from '../../store/settingsStore';
import { getLanguage } from '../../lib/languages';

export function StatusBar() {
  const activeId = useWorkspace(s => s.activeFileId);
  const file = useWorkspace(s => (activeId ? s.files[activeId] : null));
  const fileCount = useWorkspace(s => s.fileOrder.length);
  const fontSize = useSettings(s => s.fontSize);
  const setFontSize = useSettings(s => s.setFontSize);

  const lang = file ? getLanguage(file.language) : null;
  const lines = file ? file.content.split('\n').length : 0;

  return (
    <footer
      className="status row"
      style={{
        padding: '3px 10px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-alt)',
        fontSize: '0.85em',
        gap: 16,
        color: 'var(--fg-muted)',
      }}
    >
      <span>{fileCount} file{fileCount === 1 ? '' : 's'}</span>
      {file && <span>{file.path}</span>}
      {lang && <span>{lang.label}</span>}
      {file && <span>{lines} lines</span>}
      <span className="spacer" />
      <span>Font</span>
      <button onClick={() => setFontSize(fontSize - 1)} style={{ padding: '0 6px', border: 'none', height: 'auto' }} title="Decrease text size (Alt+−)">−</button>
      <span>{fontSize}</span>
      <button onClick={() => setFontSize(fontSize + 1)} style={{ padding: '0 6px', border: 'none', height: 'auto' }} title="Increase text size (Alt+=)">+</button>
    </footer>
  );
}
