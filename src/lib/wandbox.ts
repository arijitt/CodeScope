import type { LanguageMeta, RunResult } from '../types';

// Wandbox public API. Free, no key, CORS-enabled.
const WANDBOX_BASE = (import.meta.env.VITE_WANDBOX_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://wandbox.org/api';

interface WandboxCompiler {
  name: string;
  language: string;
  version: string;
  display_name: string;
}

let compilersCache: WandboxCompiler[] | null = null;
let compilersPromise: Promise<WandboxCompiler[]> | null = null;

export async function getCompilers(): Promise<WandboxCompiler[]> {
  if (compilersCache) return compilersCache;
  if (!compilersPromise) {
    compilersPromise = fetch(`${WANDBOX_BASE}/list.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Wandbox /list.json failed: ${r.status}`);
        return r.json() as Promise<WandboxCompiler[]>;
      })
      .then(rs => { compilersCache = rs; return rs; })
      .catch(err => { compilersPromise = null; throw err; });
  }
  return compilersPromise;
}

/**
 * Resolve the configured wandboxCompiler against the live list.
 * If the exact name isn't present (e.g. "rust-head" rotated), pick the
 * newest compiler for the same language family.
 */
function resolveCompiler(compilers: WandboxCompiler[], requested: string, languageHint: string): WandboxCompiler | undefined {
  const exact = compilers.find(c => c.name === requested);
  if (exact) return exact;
  // Same prefix (before first dash) — e.g. "rust-1.82.0" if "rust-head" is gone
  const prefix = requested.split('-')[0];
  const sameFamily = compilers.filter(c => c.name.startsWith(prefix + '-') || c.name === prefix);
  if (sameFamily.length > 0) return sameFamily[0];
  // Same language label fallback
  const byLang = compilers.filter(c => c.language.toLowerCase() === languageHint.toLowerCase());
  return byLang[0];
}

export interface ExecuteOptions {
  language: LanguageMeta;
  code: string;
  stdin?: string;
  signal?: AbortSignal;
}

export async function execute(opts: ExecuteOptions): Promise<RunResult> {
  if (!opts.language.runnable || !opts.language.wandboxCompiler) {
    throw new Error(`${opts.language.label} cannot be executed remotely.`);
  }
  const compilers = await getCompilers();
  const compiler = resolveCompiler(compilers, opts.language.wandboxCompiler, opts.language.label);
  if (!compiler) {
    throw new Error(`No Wandbox compiler available for ${opts.language.label}.`);
  }
  const started = performance.now();
  const res = await fetch(`${WANDBOX_BASE}/compile.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler: compiler.name,
      code: opts.code,
      stdin: opts.stdin ?? '',
      'compiler-option-raw': '',
      'runtime-option-raw': '',
      save: false,
    }),
    signal: opts.signal,
  });
  if (res.status === 429) {
    throw new Error('Rate limited by Wandbox. Please wait a moment and try again.');
  }
  if (!res.ok) {
    throw new Error(`Wandbox compile failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as {
    status?: string;            // exit code as string, e.g. "0"
    signal?: string;
    compiler_output?: string;
    compiler_error?: string;
    program_output?: string;
    program_error?: string;
  };
  const compilePart = data.compiler_error ? `[compile]\n${data.compiler_error}\n` : '';
  const exit = data.status !== undefined && data.status !== '' ? Number(data.status) : null;
  return {
    stdout: data.program_output ?? '',
    stderr: compilePart + (data.program_error ?? '') + (data.signal ? `\n[signal] ${data.signal}` : ''),
    exitCode: Number.isNaN(exit ?? NaN) ? null : exit,
    language: compiler.language,
    version: compiler.version,
    timeMs: Math.round(performance.now() - started),
  };
}
