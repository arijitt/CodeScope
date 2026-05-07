// Hand-rolled line-based diff. Avoids pulling in `diff`/`jsdiff` (~30 KB).
//
// We use the classic LCS table — O(N*M) on lines, which is fine for our
// use case (single-file diffs against an in-memory workspace). For very
// large files we fall back to a synthetic full-replace hunk.

import type { DiffHunk, DiffLine, ExecutorEdit, FileOp } from './types';

/** Above this many lines we skip LCS and emit a single full-replace hunk. */
const LCS_LINE_CAP = 4000;

function splitLines(s: string): string[] {
  if (s === '') return [];
  // Keep trailing empty line distinction by splitting on \n only.
  return s.split('\n');
}

function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
    }
  }
  return t;
}

interface RawOp { kind: ' ' | '+' | '-'; text: string }

function backtrack(a: string[], b: string[], t: number[][]): RawOp[] {
  const ops: RawOp[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { ops.push({ kind: ' ', text: a[i - 1] }); i--; j--; }
    else if (t[i - 1][j] >= t[i][j - 1]) { ops.push({ kind: '-', text: a[i - 1] }); i--; }
    else { ops.push({ kind: '+', text: b[j - 1] }); j--; }
  }
  while (i > 0) { ops.push({ kind: '-', text: a[i - 1] }); i--; }
  while (j > 0) { ops.push({ kind: '+', text: b[j - 1] }); j--; }
  return ops.reverse();
}

/** Group raw ops into hunks with up to `context` matching lines around changes. */
function groupHunks(ops: RawOp[], context = 3): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let oldLine = 1;
  let newLine = 1;
  let cur: DiffHunk | null = null;
  let trailing = 0;

  const flush = () => { if (cur && cur.lines.length) hunks.push(cur); cur = null; };

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const isChange = op.kind !== ' ';
    if (isChange) {
      if (!cur) {
        // Open a new hunk with up to `context` preceding context lines.
        const start = Math.max(0, i - context);
        const preCtx = ops.slice(start, i);
        const oldStart = oldLine - preCtx.filter((p) => p.kind !== '+').length;
        const newStart = newLine - preCtx.filter((p) => p.kind !== '-').length;
        cur = { oldStart, newStart, lines: preCtx.map<DiffLine>((p) => ({ kind: p.kind, text: p.text })) };
      }
      cur.lines.push({ kind: op.kind, text: op.text });
      trailing = 0;
    } else if (cur) {
      cur.lines.push({ kind: ' ', text: op.text });
      trailing++;
      if (trailing >= context * 2) {
        // Trim oversized trailing context, then close the hunk.
        cur.lines = cur.lines.slice(0, cur.lines.length - context);
        flush();
        trailing = 0;
      }
    }
    if (op.kind !== '+') oldLine++;
    if (op.kind !== '-') newLine++;
  }
  flush();
  return hunks;
}

/** Compute hunks between two text blobs. */
export function diffLines(oldText: string, newText: string): DiffHunk[] {
  if (oldText === newText) return [];
  const a = splitLines(oldText);
  const b = splitLines(newText);
  if (a.length > LCS_LINE_CAP || b.length > LCS_LINE_CAP) {
    return [fullReplaceHunk(a, b)];
  }
  const ops = backtrack(a, b, lcsTable(a, b));
  return groupHunks(ops);
}

function fullReplaceHunk(a: string[], b: string[]): DiffHunk {
  const lines: DiffLine[] = [
    ...a.map<DiffLine>((t) => ({ kind: '-', text: t })),
    ...b.map<DiffLine>((t) => ({ kind: '+', text: t })),
  ];
  return { oldStart: 1, newStart: 1, lines };
}

/**
 * Build display hunks for an arbitrary FileOp.
 *  - edit: real LCS diff
 *  - create: synthetic all-`+` block
 *  - delete: synthetic all-`-` block
 *  - rename: a single header hunk noting the path change; if content also
 *            changed, real diff is appended.
 */
export function hunksForEdit(opts: {
  op: FileOp;
  oldPath: string;
  newPath?: string;
  oldContent: string;
  newContent: string;
}): DiffHunk[] {
  const { op, oldContent, newContent } = opts;
  if (op === 'create') {
    return [{
      oldStart: 0,
      newStart: 1,
      lines: splitLines(newContent).map<DiffLine>((t) => ({ kind: '+', text: t })),
    }];
  }
  if (op === 'delete') {
    return [{
      oldStart: 1,
      newStart: 0,
      lines: splitLines(oldContent).map<DiffLine>((t) => ({ kind: '-', text: t })),
    }];
  }
  return diffLines(oldContent, newContent);
}

/** Convenience: total +/- counts for a list of hunks (UI summary chip). */
export function diffStats(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.kind === '+') added++;
      else if (l.kind === '-') removed++;
    }
  }
  return { added, removed };
}

/** Convenience: hunks for a single ExecutorEdit + the previous content (if any). */
export function hunksForExecutorEdit(edit: ExecutorEdit, oldContent: string): DiffHunk[] {
  return hunksForEdit({
    op: edit.op,
    oldPath: edit.path,
    newPath: edit.newPath,
    oldContent,
    newContent: edit.content,
  });
}
