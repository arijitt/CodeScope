import { useEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { SidebarResizer } from './components/SidebarResizer/SidebarResizer';
import { OutputResizer } from './components/OutputResizer/OutputResizer';
import { TabBar } from './components/TabBar/TabBar';
import { EditorPane } from './components/EditorPane/EditorPane';
import { OutputPanel } from './components/OutputPanel/OutputPanel';
import { StatusBar } from './components/StatusBar/StatusBar';
import { RunVizPanel } from './components/RunVizPanel/RunVizPanel';
import { AIAssistPanel } from './components/AIAssistPanel/AIAssistPanel';
import { RightPaneResizer } from './components/RightPaneResizer/RightPaneResizer';
import { RightSplitResizer } from './components/RightSplitResizer/RightSplitResizer';
import { useSettings } from './store/settingsStore';
import { useWorkspace } from './store/workspaceStore';
import { useRun } from './store/runStore';
import { readShareFromUrl, clearShareFromUrl } from './lib/share';
import { execute } from './lib/wandbox';
import { getLanguage } from './lib/languages';

export default function App() {
  const theme = useSettings(s => s.theme);
  const sidebarWidth = useSettings(s => s.sidebarWidth);
  const outputHeight = useSettings(s => s.outputHeight);
  const rightPaneWidth = useSettings(s => s.rightPaneWidth);
  const rightTopHeight = useSettings(s => s.rightTopHeight);
  const setRightTopHeight = useSettings(s => s.setRightTopHeight);
  const fontSize = useSettings(s => s.fontSize);
  const setFontSize = useSettings(s => s.setFontSize);
  const uiFont = useSettings(s => s.uiFont);
  const editorFont = useSettings(s => s.editorFont);
  const replaceWorkspace = useWorkspace(s => s.replaceWorkspace);
  const fileOrder = useWorkspace(s => s.fileOrder);
  const resetWorkspace = useWorkspace(s => s.resetWorkspace);

  const rightColRef = useRef<HTMLDivElement>(null);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Hydrate from share URL on first mount
  useEffect(() => {
    const shared = readShareFromUrl();
    if (shared && shared.files.length > 0) {
      const ok = confirm(`Load shared workspace (${shared.files.length} file${shared.files.length === 1 ? '' : 's'})? This replaces the current workspace.`);
      if (ok) replaceWorkspace(shared.files, shared.activeId);
      clearShareFromUrl();
    } else if (fileOrder.length === 0) {
      resetWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute initial 75% split for right column once it's measured.
  useEffect(() => {
    if (rightTopHeight !== null) return;
    const el = rightColRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0) setRightTopHeight(Math.round(h * 0.75));
  }, [rightTopHeight, setRightTopHeight]);

  // Global shortcuts: Ctrl+Enter to run
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        const { activeFileId, files, stdinByFileId } = useWorkspace.getState();
        if (!activeFileId) return;
        const file = files[activeFileId];
        if (!file) return;
        const lang = getLanguage(file.language);
        if (!lang.runnable) return;
        const run = useRun.getState();
        if (run.isRunning) return;
        run.setRunning(true);
        run.setError(null);
        try {
          const result = await execute({
            language: lang,
            code: file.content,
            stdin: stdinByFileId[activeFileId] ?? '',
          });
          run.setResult(result);
        } catch (err) {
          run.setError(err instanceof Error ? err.message : String(err));
        } finally {
          run.setRunning(false);
        }
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
      }
      // Accessibility: Alt+= / Alt+- / Alt+0 to increase/decrease/reset text size
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setFontSize(useSettings.getState().fontSize + 1);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setFontSize(useSettings.getState().fontSize - 1);
        } else if (e.key === '0') {
          e.preventDefault();
          setFontSize(14);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setFontSize]);

  const topPx = rightTopHeight ?? 0;

  return (
    <div
      className="app"
      style={{
        ['--sidebar-w' as never]: `${sidebarWidth}px`,
        ['--right-w' as never]: `${rightPaneWidth}px`,
        ['--ui-fs' as never]: `${Math.max(10, fontSize + 2)}px`,
        ['--font-ui-sel' as never]: uiFont,
        ['--font-mono-sel' as never]: editorFont,
      }}
    >
      <Toolbar />
      <Sidebar />
      <SidebarResizer />
      <main className="main">
        <TabBar />
        <div style={{ flex: 1, minHeight: 0 }}>
          <EditorPane />
        </div>
        <OutputResizer />
        <div style={{ height: outputHeight, minHeight: 60, flexShrink: 0 }}>
          <OutputPanel />
        </div>
      </main>
      <RightPaneResizer />
      <div className="right-col" ref={rightColRef}>
        <div
          className="right-top"
          style={{
            height: rightTopHeight === null ? '75%' : `${topPx}px`,
            flexShrink: 0,
            minHeight: 0,
          }}
        >
          <RunVizPanel />
        </div>
        <RightSplitResizer containerRef={rightColRef} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <AIAssistPanel />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
