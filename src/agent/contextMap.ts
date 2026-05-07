// Litecode-style context-map system, adapted for an in-browser workspace.
//
// In litecode the maps are markdown files written next to the user's source
// (`project_context.md`, `folder_context.md`, `*.file_analysis.md`) and read
// back on every run. We have no real filesystem here, so we generate the
// same three layers as in-memory strings on demand and cache them in
// `agentContextStore` keyed by a workspace hash.

import type { FileNode } from '../types';
import { detectLanguageFromFilename, getLanguage } from '../lib/languages';

/** Files larger than this many lines get a per-file analysis index. */
export const LARGE_FILE_LINE_THRESHOLD = 150;

/** Approximate chunk size (in lines) for the analysis index. */
const ANALYSIS_CHUNK_LINES = 40;

export interface FolderContext {
  /** Folder path (use '' for the workspace root). Always uses '/' separator. */
  folder: string;
  markdown: string;
}

export interface FileAnalysis {
  path: string;
  /** Markdown index; empty for small files. */
  markdown: string;
  /** Total line count; used by the executor to decide on section loading. */
  lineCount: number;
  /** Fixed-size chunk descriptors used by `loadSection()`. */
  chunks: FileChunk[];
}

export interface FileChunk {
  startLine: number; // 1-based, inclusive
  endLine: number;   // 1-based, inclusive
  /** One-line summary of what the chunk contains (heuristic). */
  summary: string;
}

export interface ContextMap {
  project: string;
  folders: FolderContext[];
  analyses: Record<string, FileAnalysis>;
  /** Stable hash of the input workspace; used by the cache. */
  hash: string;
}

/** Normalize a path to use '/' separators (workspace stores them this way). */
function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

function dirOf(path: string): string {
  const p = norm(path);
  const ix = p.lastIndexOf('/');
  return ix < 0 ? '' : p.slice(0, ix);
}

function basename(path: string): string {
  const p = norm(path);
  const ix = p.lastIndexOf('/');
  return ix < 0 ? p : p.slice(ix + 1);
}

/** A 32-bit FNV-1a hash; good enough for cache keys. */
export function workspaceHash(files: FileNode[]): string {
  let h = 0x811c9dc5;
  for (const f of files) {
    const s = `${f.path}\u0001${f.content.length}\u0001${f.updatedAt}\n`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16);
}

/** Best-guess "what is this file?" one-liner from its content + extension. */
function summarizeFile(file: FileNode): string {
  const lines = file.content.split('\n');
  // Try to find an export, class, or function declaration in the first 30 lines.
  for (const raw of lines.slice(0, 30)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(export\s+)?(default\s+)?(class|function|interface|type|enum)\b/.test(line)) return line.slice(0, 120);
    if (/^def\s+\w+|^class\s+\w+/.test(line)) return line.slice(0, 120);
    if (/^package\s+/.test(line) || /^#include\b/.test(line)) continue;
    // First non-empty, non-comment line is a decent fallback.
    if (!/^(\/\/|#|\/\*|\*)/.test(line)) return line.slice(0, 120);
  }
  const lang = getLanguage(file.language).label;
  return `${lang} file (${lines.length} lines)`;
}

function detectTechStack(files: FileNode[]): string[] {
  const exts = new Set<string>();
  for (const f of files) {
    const e = f.path.split('.').pop()?.toLowerCase() ?? '';
    if (e) exts.add(e);
  }
  const tech: string[] = [];
  if (exts.has('ts') || exts.has('tsx')) tech.push('TypeScript');
  if (exts.has('js') || exts.has('mjs') || exts.has('cjs')) tech.push('JavaScript');
  if (exts.has('py')) tech.push('Python');
  if (exts.has('java')) tech.push('Java');
  if (exts.has('cpp') || exts.has('cc') || exts.has('h') || exts.has('hpp')) tech.push('C++');
  if (exts.has('cs')) tech.push('C#');
  if (exts.has('go')) tech.push('Go');
  if (exts.has('rs')) tech.push('Rust');
  if (exts.has('rb')) tech.push('Ruby');
  if (exts.has('php')) tech.push('PHP');
  if (exts.has('html')) tech.push('HTML');
  if (exts.has('css')) tech.push('CSS');
  if (exts.has('sql')) tech.push('SQL');
  // Detect package.json for Node/React hints.
  const pkg = files.find((f) => basename(f.path) === 'package.json');
  if (pkg) {
    if (/"react"\s*:/.test(pkg.content)) tech.push('React');
    if (/"vite"\s*:/.test(pkg.content)) tech.push('Vite');
    if (/"next"\s*:/.test(pkg.content)) tech.push('Next.js');
    if (/"express"\s*:/.test(pkg.content)) tech.push('Express');
  }
  return tech;
}

function buildProjectContext(files: FileNode[]): string {
  const tech = detectTechStack(files);
  const folders = new Set<string>();
  for (const f of files) {
    const d = dirOf(f.path);
    folders.add(d || '(root)');
  }
  const lines: string[] = [
    '# Project context',
    '',
    `**Tech stack:** ${tech.length ? tech.join(', ') : '(unknown — heuristic detection found nothing)'}`,
    `**File count:** ${files.length}`,
    `**Folders:** ${[...folders].sort().join(', ')}`,
    '',
    '## Folder roles',
  ];
  // One-line role per folder based on its contents.
  const byFolder = new Map<string, FileNode[]>();
  for (const f of files) {
    const d = dirOf(f.path) || '(root)';
    if (!byFolder.has(d)) byFolder.set(d, []);
    byFolder.get(d)!.push(f);
  }
  for (const [folder, members] of [...byFolder.entries()].sort()) {
    const sample = members.slice(0, 3).map((m) => basename(m.path)).join(', ');
    lines.push(`- \`${folder}\` — ${members.length} file(s): ${sample}${members.length > 3 ? ', …' : ''}`);
  }
  return lines.join('\n');
}

function buildFolderContext(folder: string, members: FileNode[]): FolderContext {
  const lines: string[] = [`# Folder: ${folder || '(root)'}`, ''];
  for (const f of members.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`- \`${basename(f.path)}\` (${getLanguage(f.language).label}, ${f.content.split('\n').length} lines) — ${summarizeFile(f)}`);
  }
  return { folder, markdown: lines.join('\n') };
}

function buildFileAnalysis(file: FileNode): FileAnalysis {
  const lines = file.content.split('\n');
  const total = lines.length;
  if (total <= LARGE_FILE_LINE_THRESHOLD) {
    return { path: file.path, markdown: '', lineCount: total, chunks: [] };
  }
  const chunks: FileChunk[] = [];
  for (let start = 1; start <= total; start += ANALYSIS_CHUNK_LINES) {
    const end = Math.min(total, start + ANALYSIS_CHUNK_LINES - 1);
    // Pick a representative non-empty line from the chunk for the summary.
    let summary = '';
    for (let i = start - 1; i < end; i++) {
      const t = lines[i].trim();
      if (t && !/^(\/\/|#|\/\*|\*|--)/.test(t)) { summary = t.slice(0, 100); break; }
    }
    if (!summary) summary = '(blank / comments)';
    chunks.push({ startLine: start, endLine: end, summary });
  }
  const md: string[] = [`# File analysis: ${file.path}`, '', `Total lines: ${total}`, ''];
  for (const c of chunks) md.push(`- L${c.startLine}–${c.endLine}: ${c.summary}`);
  return { path: file.path, markdown: md.join('\n'), lineCount: total, chunks };
}

/** Build the full three-layer context map for the given workspace. */
export function buildContextMap(files: FileNode[]): ContextMap {
  const project = buildProjectContext(files);
  const byFolder = new Map<string, FileNode[]>();
  for (const f of files) {
    const d = dirOf(f.path);
    if (!byFolder.has(d)) byFolder.set(d, []);
    byFolder.get(d)!.push(f);
  }
  const folders: FolderContext[] = [];
  for (const [folder, members] of [...byFolder.entries()].sort()) {
    folders.push(buildFolderContext(folder, members));
  }
  const analyses: Record<string, FileAnalysis> = {};
  for (const f of files) analyses[f.path] = buildFileAnalysis(f);
  return { project, folders, analyses, hash: workspaceHash(files) };
}

/**
 * Load a section of a file using its analysis chunks. The executor calls this
 * when the full file would not fit in the remaining token budget.
 *
 * Strategy: pick chunks centered on `hint` keyword matches; expand outward
 * until `maxChars` is reached or we run out of chunks.
 */
export function loadSection(file: FileNode, hint: string, maxChars: number): { content: string; lineRange: [number, number] } {
  const lines = file.content.split('\n');
  if (file.content.length <= maxChars) {
    return { content: file.content, lineRange: [1, lines.length] };
  }
  // Find matching chunks via the hint. Fall back to the top of the file.
  const analysis = buildFileAnalysis(file);
  const lower = hint.toLowerCase();
  const scored = analysis.chunks.map((c, idx) => {
    const sliceText = lines.slice(c.startLine - 1, c.endLine).join('\n').toLowerCase();
    const score = lower && sliceText.includes(lower) ? 2 : 0;
    return { idx, c, score };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const picked: FileChunk[] = [];
  let charCount = 0;
  for (const s of scored) {
    const text = lines.slice(s.c.startLine - 1, s.c.endLine).join('\n');
    if (charCount + text.length + 1 > maxChars) break;
    picked.push(s.c);
    charCount += text.length + 1;
  }
  if (picked.length === 0) {
    // Take the first chunk as a fallback.
    const c = analysis.chunks[0];
    const text = lines.slice(c.startLine - 1, Math.min(c.endLine, c.startLine + 40)).join('\n').slice(0, maxChars);
    return { content: text, lineRange: [c.startLine, c.startLine + text.split('\n').length - 1] };
  }
  picked.sort((a, b) => a.startLine - b.startLine);
  // Merge picked chunks into one text blob with line-range headers.
  const parts: string[] = [];
  for (const c of picked) {
    parts.push(`// --- L${c.startLine}–${c.endLine} ---`);
    parts.push(lines.slice(c.startLine - 1, c.endLine).join('\n'));
  }
  return {
    content: parts.join('\n'),
    lineRange: [picked[0].startLine, picked[picked.length - 1].endLine],
  };
}

// Re-export language detection for executor convenience.
export { detectLanguageFromFilename };
