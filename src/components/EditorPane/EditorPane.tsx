import { useEffect, useRef } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import { useWorkspace } from '../../store/workspaceStore';
import { useSettings } from '../../store/settingsStore';
import { getLanguage } from '../../lib/languages';

// Use CDN-hosted monaco workers (default loader behavior). No extra setup needed.
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs' } });

export function EditorPane() {
  const activeId = useWorkspace(s => s.activeFileId);
  const file = useWorkspace(s => (activeId ? s.files[activeId] : null));
  const updateContent = useWorkspace(s => s.updateContent);
  const theme = useSettings(s => s.theme);
  const fontSize = useSettings(s => s.fontSize);
  const editorFont = useSettings(s => s.editorFont);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  useEffect(() => {
    // Force layout when font size or font family changes
    editorRef.current?.layout();
  }, [fontSize, editorFont]);

  if (!file) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }} className="muted">
        No file open. Create one from the sidebar.
      </div>
    );
  }
  const lang = getLanguage(file.language);

  return (
    <Editor
      height="100%"
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      language={lang.monacoId}
      value={file.content}
      path={file.path}
      onChange={(v) => updateContent(file.id, v ?? '')}
      onMount={(editor) => { editorRef.current = editor; }}
      options={{
        fontSize,
        fontFamily: editorFont,
        fontLigatures: true,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: 'on',
        renderWhitespace: 'selection',
      }}
    />
  );
}
