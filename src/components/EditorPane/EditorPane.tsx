import { useEffect, useRef } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useWorkspace } from '../../store/workspaceStore';
import { useSettings } from '../../store/settingsStore';
import { useViz } from '../../store/vizStore';
import { getLanguage } from '../../lib/languages';

// Use CDN-hosted monaco workers (default loader behavior). No extra setup needed.
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs' } });

type IStandaloneCodeEditor = Parameters<OnMount>[0];

export function EditorPane() {
  const activeId = useWorkspace(s => s.activeFileId);
  const file = useWorkspace(s => (activeId ? s.files[activeId] : null));
  const updateContent = useWorkspace(s => s.updateContent);
  const theme = useSettings(s => s.theme);
  const fontSize = useSettings(s => s.fontSize);
  const editorFont = useSettings(s => s.editorFont);
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  // Phase 7 — guards / handles for cursor↔step binding.
  const programmaticUpdateRef = useRef(false);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  // Phase 7 — viz store selectors. We resubscribe selectively to keep renders cheap.
  const followCode = useViz(s => s.followCode);
  const plan = useViz(s => s.plan);
  const trace = useViz(s => s.trace);
  const currentStep = useViz(s => s.currentStep);
  const vizFileId = useViz(s => s.vizFileId);
  const stepFromLine = useViz(s => s.stepFromLine);
  const lineForStep = useViz(s => s.lineForStep);
  const seek = useViz(s => s.seek);
  const refreshStale = useViz(s => s.refreshStale);

  useEffect(() => {
    // Force layout when font size or font family changes
    editorRef.current?.layout();
  }, [fontSize, editorFont]);

  // ── Phase 7 ── Viz step → editor cursor + decoration ──────────────────
  // Active only when followCode is on, a trace exists, and the visualized
  // file is the one being viewed.
  const bindingActive = followCode && !!plan && !!trace && !!vizFileId && vizFileId === activeId;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!bindingActive) {
      // Tear down any stale executing-line decoration when binding is off.
      decorationsRef.current?.clear();
      return;
    }
    const targetLine = lineForStep(currentStep);
    if (typeof targetLine !== 'number' || targetLine <= 0) {
      decorationsRef.current?.clear();
      return;
    }

    // Apply / refresh the executing-line decoration.
    if (!decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection();
    }
    decorationsRef.current.set([
      {
        range: { startLineNumber: targetLine, startColumn: 1, endLineNumber: targetLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: 'viz-exec-line',
          glyphMarginClassName: 'viz-exec-glyph',
          stickiness: 1, // NeverGrowsWhenTypingAtEdges
        },
      },
    ]);

    // Move cursor + reveal — but only if it isn't already there (avoids
    // jitter while the user is actively typing on that same line).
    const pos = editor.getPosition();
    if (!pos || pos.lineNumber !== targetLine) {
      programmaticUpdateRef.current = true;
      editor.setPosition({ lineNumber: targetLine, column: 1 });
      editor.revealLineInCenterIfOutsideViewport(targetLine);
      // Release the guard in a microtask — Monaco fires the cursor event sync.
      queueMicrotask(() => { programmaticUpdateRef.current = false; });
    }
  }, [bindingActive, currentStep, lineForStep]);

  // Editor cursor → viz step. Wired once on mount; checks bindingActive at
  // event time to gate without re-subscribing.
  const bindingActiveRef = useRef(bindingActive);
  bindingActiveRef.current = bindingActive;
  const stepFromLineRef = useRef(stepFromLine);
  stepFromLineRef.current = stepFromLine;
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      // Ignore the bounce from our own setPosition call.
      if (programmaticUpdateRef.current) return;
      if (!bindingActiveRef.current) return;
      // Only react to user-initiated changes (typing, click, keyboard nav).
      // Programmatic Monaco moves we didn't issue (e.g., after content reset)
      // come through as Source.Api but we want to ignore those too.
      if (e.source !== 'mouse' && e.source !== 'keyboard') return;
      const target = stepFromLineRef.current(e.position.lineNumber);
      if (target === null) return;
      if (target !== currentStepRef.current) {
        seekRef.current(target);
      }
    });
  };

  // ── Phase 7 ── Edit-watch: flip staleSource when the visualized file
  // diverges from the snapshot taken at Visualize time.
  useEffect(() => {
    if (!vizFileId || !file || file.id !== vizFileId) return;
    refreshStale(file.content);
  }, [vizFileId, file, refreshStale]);

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
      onMount={handleMount}
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
        glyphMargin: true,
      }}
    />
  );
}
