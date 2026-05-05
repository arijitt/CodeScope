import type { LanguageMeta, RunResult } from '../types';

// Endpoint is configurable via Vite env var so users can self-host Piston
// or point at any whitelisted/mirror instance. The original public emkc.org
// endpoint became whitelist-only on 2026-02-15 and now returns 401.
const PISTON_BASE = (import.meta.env.VITE_PISTON_URL as string | undefined)?.replace(/\/+$/, '')
  || 'http://localhost:2000/api/v2';

const WHITELIST_HINT =
  'The configured Piston endpoint rejected the request. ' +
  'The public emkc.org Piston API is whitelist-only since 2026-02-15. ' +
  'Set VITE_PISTON_URL to a self-hosted Piston instance (see README) and rebuild.';

interface Runtime { language: string; version: string; aliases: string[]; }

let runtimesCache: Runtime[] | null = null;
let runtimesPromise: Promise<Runtime[]> | null = null;

export async function getRuntimes(): Promise<Runtime[]> {
  if (runtimesCache) return runtimesCache;
  if (!runtimesPromise) {
    runtimesPromise = fetch(`${PISTON_BASE}/runtimes`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) throw new Error(WHITELIST_HINT);
        if (!r.ok) throw new Error(`Piston /runtimes failed: ${r.status} ${r.statusText}`);
        return r.json() as Promise<Runtime[]>;
      })
      .then(rs => { runtimesCache = rs; return rs; })
      .catch(err => { runtimesPromise = null; throw err; });
  }
  return runtimesPromise;
}

function resolveRuntime(runtimes: Runtime[], pistonName: string): Runtime | undefined {
  const target = pistonName.toLowerCase();
  const matches = runtimes.filter(r =>
    r.language.toLowerCase() === target || r.aliases.some(a => a.toLowerCase() === target)
  );
  if (matches.length === 0) return undefined;
  // Pick highest version (lexicographic is OK for most semver-ish)
  return matches.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
}

export interface ExecuteOptions {
  language: LanguageMeta;
  code: string;
  filename?: string;
  stdin?: string;
}

export async function execute(opts: ExecuteOptions): Promise<RunResult> {
  if (!opts.language.runnable || !opts.language.pistonRuntime) {
    throw new Error(`${opts.language.label} cannot be executed remotely.`);
  }
  const runtimes = await getRuntimes();
  const runtime = resolveRuntime(runtimes, opts.language.pistonRuntime);
  if (!runtime) {
    throw new Error(`No Piston runtime available for ${opts.language.label}.`);
  }
  const started = performance.now();
  const res = await fetch(`${PISTON_BASE}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: runtime.language,
      version: runtime.version,
      files: [{ name: opts.filename ?? opts.language.defaultFilename, content: opts.code }],
      stdin: opts.stdin ?? '',
    }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(WHITELIST_HINT);
  }
  if (res.status === 429) {
    throw new Error('Rate limited by Piston. Please wait a moment and try again.');
  }
  if (!res.ok) {
    throw new Error(`Piston /execute failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as {
    run: { stdout: string; stderr: string; code: number | null; output: string };
    compile?: { stdout: string; stderr: string; code: number | null };
    language: string; version: string;
  };
  const compileErr = data.compile?.stderr ? `[compile]\n${data.compile.stderr}\n` : '';
  return {
    stdout: data.run.stdout ?? '',
    stderr: compileErr + (data.run.stderr ?? ''),
    exitCode: data.run.code,
    language: data.language,
    version: data.version,
    timeMs: Math.round(performance.now() - started),
  };
}
