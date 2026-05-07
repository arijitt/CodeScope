// Pure helpers for short-term memory: format for prompt injection,
// push to the ring buffer after a successful apply.

import { useAgentMemory } from '../store/agentMemoryStore';
import type { MemoryEntry } from './types';

/**
 * Render the memory ring as a compact markdown block suitable for prepending
 * to either the planner's or the executor's system prompt.
 *
 * Empty ring returns ''. The caller is expected to omit the section entirely
 * in that case rather than emit a header with no content.
 */
export function formatMemoryBlock(entries: MemoryEntry[]): string {
  if (!entries || entries.length === 0) return '';
  const lines: string[] = [
    '## Recent agent memory (most recent last)',
    '',
    'Use these entries to reason about phrases like "undo", "revert", "previous", "last time", "also":',
    '',
  ];
  for (const e of entries) {
    const filesStr = e.files.length === 0 ? '(no files written)' : e.files.join(', ');
    lines.push(`- "${e.request}" → ${e.synthesis} [files: ${filesStr}]`);
  }
  return lines.join('\n');
}

/**
 * Push a memory entry. Called by the apply step in DiffPreviewModal once at
 * least one edit has been written to the workspace.
 */
export function pushMemory(entry: Omit<MemoryEntry, 'timestamp'>): void {
  if (entry.files.length === 0) return; // litecode rule: only after success
  useAgentMemory.getState().push(entry);
}

/** Read the current ring (newest last). */
export function readMemory(): MemoryEntry[] {
  return useAgentMemory.getState().entries;
}
