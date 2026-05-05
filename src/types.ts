export type LanguageId =
  | 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'csharp'
  | 'go' | 'rust' | 'ruby' | 'php' | 'html' | 'css' | 'json'
  | 'markdown' | 'sql';

export interface LanguageMeta {
  id: LanguageId;
  label: string;
  monacoId: string;
  pistonRuntime: string;
  wandboxCompiler: string;     // empty = not executable via Wandbox
  defaultFilename: string;
  fileExtension: string;
  starterCode: string;
  runnable: boolean;
}

export interface FileNode {
  id: string;
  path: string;
  language: LanguageId;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface TabState {
  fileId: string;
  dirty: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  language: string;
  version: string;
  timeMs: number;
}
