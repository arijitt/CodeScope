import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface SettingsState {
  theme: Theme;
  fontSize: number;
  uiFont: string;
  editorFont: string;
  sidebarWidth: number;
  outputHeight: number;
  rightPaneWidth: number;
  rightTopHeight: number | null;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setFontSize: (n: number) => void;
  setUiFont: (f: string) => void;
  setEditorFont: (f: string) => void;
  setSidebarWidth: (n: number) => void;
  setOutputHeight: (n: number) => void;
  setRightPaneWidth: (n: number) => void;
  setRightTopHeight: (n: number) => void;
}

export interface FontOption {
  id: string;       // value stored in settings (a CSS font-family stack)
  label: string;    // dropdown label
}

export const UI_FONTS: FontOption[] = [
  { id: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", label: 'System (default)' },
  { id: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", label: 'Inter' },
  { id: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", label: 'Segoe UI' },
  { id: "Roboto, Arial, sans-serif", label: 'Roboto' },
  { id: "Arial, Helvetica, sans-serif", label: 'Arial' },
  { id: "Verdana, Geneva, sans-serif", label: 'Verdana' },
  { id: "Georgia, 'Times New Roman', serif", label: 'Georgia (serif)' },
];

export const EDITOR_FONTS: FontOption[] = [
  { id: "'Consolas', 'Menlo', 'Monaco', monospace", label: 'Consolas (default)' },
  { id: "'JetBrains Mono', 'Consolas', monospace", label: 'JetBrains Mono' },
  { id: "'Fira Code', 'Consolas', monospace", label: 'Fira Code' },
  { id: "'Source Code Pro', 'Consolas', monospace", label: 'Source Code Pro' },
  { id: "'Menlo', 'Monaco', monospace", label: 'Menlo' },
  { id: "'Courier New', Courier, monospace", label: 'Courier New' },
];

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14,
      uiFont: UI_FONTS[0].id,
      editorFont: EDITOR_FONTS[0].id,
      sidebarWidth: 220,
      outputHeight: 200,
      rightPaneWidth: 360,
      rightTopHeight: null,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setFontSize: (fontSize) => set({ fontSize: Math.max(10, Math.min(28, fontSize)) }),
      setUiFont: (uiFont) => set({ uiFont }),
      setEditorFont: (editorFont) => set({ editorFont }),
      setSidebarWidth: (n) => set({ sidebarWidth: Math.max(140, Math.min(600, Math.round(n))) }),
      setOutputHeight: (n) => set({ outputHeight: Math.max(60, Math.min(800, Math.round(n))) }),
      setRightPaneWidth: (n) => set({ rightPaneWidth: Math.max(200, Math.min(700, Math.round(n))) }),
      setRightTopHeight: (n) => set({ rightTopHeight: Math.max(80, Math.round(n)) }),
    }),
    { name: 'web-ide.settings.v1', version: 1 }
  )
);
