// Phase 5: Litecode-style coding agent types.
// All types live here so the agent module + UI + stores share one source of truth.

import type { LanguageId } from '../types';

/** Operation requested by the planner / produced by the executor. */
export type FileOp = 'edit' | 'create' | 'rename' | 'delete';

/** A single planned change for one file (or one rename pair). */
export interface Task {
  /** Stable identifier within this run; used for deps + UI. */
  id: string;
  /** Existing file path (for edit/rename/delete) or new path (for create). */
  path: string;
  /** New path for rename ops. Ignored for other ops. */
  newPath?: string;
  op: FileOp;
  /** Free-form one-liner describing the change. Forwarded to the executor. */
  hint: string;
  /** IDs of other tasks that must complete before this one runs. */
  deps: string[];
  /** Optional language hint for `create`. Inferred from extension if absent. */
  language?: LanguageId;
}

/** Planner's structured response. */
export interface PlannerOutput {
  /** One-sentence description of what the plan will do. Stored in memory. */
  synthesis: string;
  tasks: Task[];
}

/** Executor's proposed change for one task. */
export interface ExecutorEdit {
  taskId: string;
  path: string;
  newPath?: string;
  op: FileOp;
  /** New full file content for edit/create. Empty for delete. */
  content: string;
  language?: LanguageId;
  /** Filled when the executor failed; UI surfaces this in the modal. */
  error?: string;
}

/** A single contiguous diff hunk for the preview modal. */
export interface DiffHunk {
  /** Line number in the OLD file where this hunk starts (1-based). */
  oldStart: number;
  /** Line number in the NEW file where this hunk starts (1-based). */
  newStart: number;
  lines: DiffLine[];
}

export interface DiffLine {
  kind: ' ' | '+' | '-';
  text: string;
}

/** Short-term memory entry — ring buffer of 4. Mirrors litecode v1.1. */
export interface MemoryEntry {
  request: string;
  synthesis: string;
  files: string[];
  timestamp: number;
}

/** Per-file token-budget breakdown returned by canFit() for diagnostics. */
export interface BudgetBreakdown {
  total: number;
  systemPrompt: number;
  reservedReply: number;
  memory: number;
  projectContext: number;
  folderContext: number;
  code: number;
  /** True when everything fits within `total`. */
  fits: boolean;
  /** Human-readable explanation of any drops applied. */
  notes: string[];
}

/** Status of an in-flight agent run. Drives the Agent tab UI. */
export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'previewing'
  | 'applying'
  | 'error'
  | 'cancelled';

export interface AgentLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}
