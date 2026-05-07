import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FileNode, LanguageId, TabState } from '../types';
import { getLanguage, detectLanguageFromFilename } from '../lib/languages';
import { uid } from '../lib/uid';
import type { ExecutorEdit } from '../agent/types';

interface WorkspaceState {
  files: Record<string, FileNode>;
  fileOrder: string[];        // ordering for sidebar
  tabs: TabState[];
  activeFileId: string | null;
  stdinByFileId: Record<string, string>;

  createFile: (path?: string, language?: LanguageId, content?: string) => string;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newPath: string) => void;
  updateContent: (id: string, content: string) => void;
  setLanguage: (id: string, language: LanguageId) => void;
  setStdin: (id: string, value: string) => void;

  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;

  replaceWorkspace: (files: FileNode[], activeId: string | null) => void;
  resetWorkspace: () => void;

  /**
   * Atomically apply a batch of agent-proposed edits inside a single set()
   * so tabs/UI/Monaco update once. Returns the list of paths actually
   * written, suitable for memory-entry construction.
   */
  applyAgentEdits: (edits: ExecutorEdit[]) => string[];
}

function makeStarterFile(): FileNode {
  const lang = getLanguage('javascript');
  const now = Date.now();
  return {
    id: uid(),
    path: lang.defaultFilename,
    language: lang.id,
    content: lang.starterCode,
    createdAt: now,
    updatedAt: now,
  };
}

function uniquePath(existing: Set<string>, candidate: string): string {
  if (!existing.has(candidate)) return candidate;
  const dot = candidate.lastIndexOf('.');
  const base = dot >= 0 ? candidate.slice(0, dot) : candidate;
  const ext = dot >= 0 ? candidate.slice(dot) : '';
  let i = 2;
  while (existing.has(`${base}-${i}${ext}`)) i++;
  return `${base}-${i}${ext}`;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      files: {},
      fileOrder: [],
      tabs: [],
      activeFileId: null,
      stdinByFileId: {},

      createFile: (path, language, content) => {
        const lang = getLanguage(language ?? (path ? detectLanguageFromFilename(path) : 'javascript'));
        const proposed = path && path.trim().length > 0 ? path.trim() : lang.defaultFilename;
        const existing = new Set(Object.values(get().files).map(f => f.path));
        const finalPath = uniquePath(existing, proposed);
        const now = Date.now();
        const file: FileNode = {
          id: uid(),
          path: finalPath,
          language: lang.id,
          content: content ?? lang.starterCode,
          createdAt: now,
          updatedAt: now,
        };
        set(s => ({
          files: { ...s.files, [file.id]: file },
          fileOrder: [...s.fileOrder, file.id],
          tabs: s.tabs.find(t => t.fileId === file.id) ? s.tabs : [...s.tabs, { fileId: file.id, dirty: false }],
          activeFileId: file.id,
        }));
        return file.id;
      },

      deleteFile: (id) => set(s => {
        const { [id]: _removed, ...rest } = s.files;
        const { [id]: _stdin, ...restStdin } = s.stdinByFileId;
        const order = s.fileOrder.filter(x => x !== id);
        const tabs = s.tabs.filter(t => t.fileId !== id);
        let active = s.activeFileId;
        if (active === id) {
          active = tabs.length > 0 ? tabs[tabs.length - 1].fileId : (order[0] ?? null);
        }
        return { files: rest, fileOrder: order, tabs, activeFileId: active, stdinByFileId: restStdin };
      }),

      renameFile: (id, newPath) => set(s => {
        const f = s.files[id];
        if (!f) return s;
        const trimmed = newPath.trim();
        if (!trimmed || trimmed === f.path) return s;
        const others = new Set(Object.values(s.files).filter(x => x.id !== id).map(x => x.path));
        const finalPath = uniquePath(others, trimmed);
        const language = detectLanguageFromFilename(finalPath);
        return {
          files: { ...s.files, [id]: { ...f, path: finalPath, language, updatedAt: Date.now() } },
        };
      }),

      updateContent: (id, content) => set(s => {
        const f = s.files[id];
        if (!f || f.content === content) return s;
        return {
          files: { ...s.files, [id]: { ...f, content, updatedAt: Date.now() } },
        };
      }),

      setLanguage: (id, language) => set(s => {
        const f = s.files[id];
        if (!f) return s;
        if (f.language === language) return s;
        const newLang = getLanguage(language);

        // An explicit language change from the toolbar is treated as
        // "give me a fresh starter for this language" — otherwise the
        // user's previous code stays in place and the editor appears
        // stuck on the old language with new highlighting. To preserve
        // existing code instead, the user can rename the file extension.
        const newContent = newLang.starterCode;

        // Rename file extension to match the new language when the path
        // looks like the previous language's default filename (or has no ext).
        const oldLang = getLanguage(f.language);
        const baseName = f.path.replace(/\.[^./\\]+$/, '');
        const renameToDefault = f.path === oldLang.defaultFilename;
        const others = new Set(Object.values(s.files).filter(x => x.id !== id).map(x => x.path));
        let newPath = f.path;
        if (renameToDefault) {
          newPath = uniquePath(others, newLang.defaultFilename);
        } else if (!/\.[^./\\]+$/.test(f.path)) {
          newPath = uniquePath(others, `${f.path}.${newLang.fileExtension}`);
        } else {
          // Swap the extension while keeping the basename
          newPath = uniquePath(others, `${baseName}.${newLang.fileExtension}`);
        }

        return {
          files: {
            ...s.files,
            [id]: {
              ...f,
              language,
              path: newPath,
              content: newContent,
              updatedAt: Date.now(),
            },
          },
        };
      }),

      openTab: (id) => set(s => {
        if (!s.files[id]) return s;
        const tabs = s.tabs.find(t => t.fileId === id) ? s.tabs : [...s.tabs, { fileId: id, dirty: false }];
        return { tabs, activeFileId: id };
      }),

      closeTab: (id) => set(s => {
        const idx = s.tabs.findIndex(t => t.fileId === id);
        if (idx === -1) return s;
        const tabs = s.tabs.filter(t => t.fileId !== id);
        let active = s.activeFileId;
        if (active === id) {
          const next = tabs[idx] ?? tabs[idx - 1] ?? null;
          active = next?.fileId ?? null;
        }
        return { tabs, activeFileId: active };
      }),

      setActive: (id) => set(s => (s.files[id] ? { activeFileId: id } : s)),

      setStdin: (id, value) => set(s => (s.files[id] ? { stdinByFileId: { ...s.stdinByFileId, [id]: value } } : s)),

      replaceWorkspace: (files, activeId) => {
        const map: Record<string, FileNode> = {};
        const order: string[] = [];
        for (const f of files) { map[f.id] = f; order.push(f.id); }
        const active = activeId && map[activeId] ? activeId : (order[0] ?? null);
        set({
          files: map,
          fileOrder: order,
          tabs: active ? [{ fileId: active, dirty: false }] : [],
          activeFileId: active,
        });
      },

      resetWorkspace: () => {
        const f = makeStarterFile();
        set({
          files: { [f.id]: f },
          fileOrder: [f.id],
          tabs: [{ fileId: f.id, dirty: false }],
          activeFileId: f.id,
        });
      },

      applyAgentEdits: (edits) => {
        const written: string[] = [];
        set((s) => {
          const files = { ...s.files };
          const order = [...s.fileOrder];
          let tabs = [...s.tabs];
          let active = s.activeFileId;
          const stdinByFileId = { ...s.stdinByFileId };
          const now = Date.now();

          // Helper: find a file by its current path (case-sensitive).
          const findIdByPath = (p: string): string | null => {
            for (const id of order) if (files[id]?.path === p) return id;
            return null;
          };

          const usedPaths = (excludeId?: string) =>
            new Set(
              order
                .filter((id) => id !== excludeId)
                .map((id) => files[id]?.path)
                .filter(Boolean) as string[]
            );

          for (const edit of edits) {
            if (edit.error) continue; // never apply failed edits

            if (edit.op === 'create') {
              const lang = getLanguage(edit.language ?? detectLanguageFromFilename(edit.path));
              const finalPath = uniquePath(usedPaths(), edit.path);
              const id = uid();
              files[id] = {
                id,
                path: finalPath,
                language: lang.id,
                content: edit.content,
                createdAt: now,
                updatedAt: now,
              };
              order.push(id);
              if (!tabs.find((t) => t.fileId === id)) tabs.push({ fileId: id, dirty: false });
              active = id;
              written.push(finalPath);
              continue;
            }

            const id = findIdByPath(edit.path);
            if (!id) {
              // No-op — file disappeared between plan and apply; surface via console.
              // The modal already showed staleness via diff so the user accepted at their own risk.
              continue;
            }

            if (edit.op === 'delete') {
              const removedPath = files[id].path;
              delete files[id];
              delete stdinByFileId[id];
              const idx = order.indexOf(id);
              if (idx >= 0) order.splice(idx, 1);
              tabs = tabs.filter((t) => t.fileId !== id);
              if (active === id) {
                active = tabs.length > 0 ? tabs[tabs.length - 1].fileId : (order[0] ?? null);
              }
              written.push(removedPath);
              continue;
            }

            if (edit.op === 'rename') {
              const targetRaw = (edit.newPath ?? '').trim();
              if (!targetRaw) continue;
              const others = usedPaths(id);
              const finalPath = uniquePath(others, targetRaw);
              const lang = detectLanguageFromFilename(finalPath);
              files[id] = {
                ...files[id],
                path: finalPath,
                language: lang,
                // Apply content change too if the executor changed it during the rename.
                content: edit.content !== '' ? edit.content : files[id].content,
                updatedAt: now,
              };
              written.push(finalPath);
              continue;
            }

            // edit
            files[id] = { ...files[id], content: edit.content, updatedAt: now };
            written.push(files[id].path);
          }

          return {
            files,
            fileOrder: order,
            tabs,
            activeFileId: active,
            stdinByFileId,
          };
        });
        return written;
      },
    }),
    {
      name: 'web-ide.workspace.v1',
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state && state.fileOrder.length === 0) state.resetWorkspace();
      },
    }
  )
);
