import { useState } from 'react';
import { Play, Sun, Moon, Share2, Download, Loader2, Code2, Type, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';
import { useSettings, EDITOR_FONTS } from '../../store/settingsStore';
import { useRun } from '../../store/runStore';
import { useViz } from '../../store/vizStore';
import { useAI } from '../../store/aiStore';
import { useAgent } from '../../store/agentStore';
import { LANGUAGES, getLanguage } from '../../lib/languages';
import { execute } from '../../lib/wandbox';
import { downloadFile, downloadWorkspaceZip } from '../../lib/download';
import { buildShareUrl } from '../../lib/share';
import { AuthChip } from '../AuthChip/AuthChip';
import type { LanguageId } from '../../types';

export function Toolbar() {
  const activeId = useWorkspace(s => s.activeFileId);
  const file = useWorkspace(s => (activeId ? s.files[activeId] : null));
  const setLanguage = useWorkspace(s => s.setLanguage);
  const updateContent = useWorkspace(s => s.updateContent);
  const setStdin = useWorkspace(s => s.setStdin);
  const filesMap = useWorkspace(s => s.files);
  const fileOrder = useWorkspace(s => s.fileOrder);

  const theme = useSettings(s => s.theme);
  const toggleTheme = useSettings(s => s.toggleTheme);
  const fontSize = useSettings(s => s.fontSize);
  const setFontSize = useSettings(s => s.setFontSize);
  const editorFont = useSettings(s => s.editorFont);
  const setEditorFont = useSettings(s => s.setEditorFont);

  const isRunning = useRun(s => s.isRunning);
  const setRunning = useRun(s => s.setRunning);
  const setResult = useRun(s => s.setResult);
  const setError = useRun(s => s.setError);

  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const lang = file ? getLanguage(file.language) : null;
  const canRun = !!file && !!lang?.runnable && !isRunning;

  const onRun = async () => {
    if (!file || !lang) return;
    setRunning(true);
    setError(null);
    try {
      const stdin = useWorkspace.getState().stdinByFileId[file.id] ?? '';
      const result = await execute({
        language: lang,
        code: file.content,
        stdin,
      });
      setResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onShare = async () => {
    const allFiles = fileOrder.map(id => filesMap[id]).filter(Boolean);
    const { url, tooLarge } = buildShareUrl(allFiles, activeId);
    if (tooLarge) {
      setShareNotice('Workspace too large to share via URL.');
      setTimeout(() => setShareNotice(null), 3000);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('Share URL copied to clipboard!');
    } catch {
      prompt('Copy this URL:', url);
    }
    setTimeout(() => setShareNotice(null), 3000);
  };

  const onDownload = async (mode: 'file' | 'zip') => {
    if (mode === 'file' && file) {
      downloadFile(file);
    } else if (mode === 'zip') {
      const all = fileOrder.map(id => filesMap[id]).filter(Boolean);
      if (all.length > 0) await downloadWorkspaceZip(all);
    }
  };

  const onResetCode = () => {
    if (!file) return;
    const ok = window.confirm(
      'Reset this file to the starter and clear the visualization, chat, and agent state? This cannot be undone.'
    );
    if (!ok) return;
    const langMeta = getLanguage(file.language);
    updateContent(file.id, langMeta.starterCode);
    setStdin(file.id, '');
    useViz.getState().resetAll();
    useAI.getState().clear();
    useAgent.getState().reset();
    setResult(null);
    setError(null);
  };

  return (
    <header
      className="toolbar row"
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-alt)',
        gap: 14,
        flexWrap: 'wrap',
        minHeight: 72,
        fontSize: 16,
      }}
    >
      <div className="row" style={{ gap: 10, fontWeight: 700, fontSize: 22 }}>
        <Code2 size={28} /> Web IDE
      </div>

      <select
        className="toolbar-control"
        value={file?.language ?? 'javascript'}
        onChange={(e) => file && setLanguage(file.id, e.target.value as LanguageId)}
        disabled={!file}
        title="Language"
      >
        {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>

      <button onClick={onRun} disabled={!canRun} className="primary toolbar-control" title={lang?.runnable ? 'Run Code (Ctrl+Enter)' : 'This language is not executable'}>
        {isRunning ? <Loader2 size={20} className="spin" /> : <Play size={20} />}
        Run Code
      </button>

      <span className="spacer" />

      {shareNotice && <span className="muted">{shareNotice}</span>}

      <button
        className="danger toolbar-control"
        onClick={onResetCode}
        disabled={!file}
        title="Reset code to the language's starter and clear the visualization, chat, and agent panels"
      >
        <RotateCcw size={20} /> Reset Code
      </button>

      <select
        className="toolbar-control toolbar-font-select"
        value={editorFont}
        onChange={(e) => setEditorFont(e.target.value)}
        title="Code font"
        aria-label="Code font"
      >
        {EDITOR_FONTS.map(f => <option key={f.id} value={f.id} style={{ fontFamily: f.id }}>{f.label}</option>)}
      </select>

      <div className="row text-size-group" title={`Text size: ${fontSize}px (Alt+= / Alt+− / Alt+0)`}>
        <button
          className="toolbar-control toolbar-icon"
          onClick={() => setFontSize(fontSize - 1)}
          aria-label="Decrease text size"
          title="Decrease text size (Alt+−)"
        >
          <Type size={14} />−
        </button>
        <span className="text-size-value" aria-live="polite">{fontSize}</span>
        <button
          className="toolbar-control toolbar-icon"
          onClick={() => setFontSize(fontSize + 1)}
          aria-label="Increase text size"
          title="Increase text size (Alt+=)"
        >
          <Type size={20} />+
        </button>
      </div>

      <button className="toolbar-control" onClick={onShare} title="Copy share URL"><Share2 size={20} /> Share</button>
      <button className="toolbar-control" onClick={() => onDownload('file')} disabled={!file} title="Download active file">
        <Download size={20} /> File
      </button>
      <button className="toolbar-control" onClick={() => onDownload('zip')} disabled={fileOrder.length === 0} title="Download workspace as ZIP">
        <Download size={20} /> ZIP
      </button>
      <button className="toolbar-control toolbar-icon" onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <AuthChip variant="toolbar" />
    </header>
  );
}
