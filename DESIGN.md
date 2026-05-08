# CodeScope — Engineering Documentation

> A browser-based IDE with a Monaco editor, remote code execution (Wandbox), an AI chat / multi-file coding agent (Litecode-style), and a code-execution visualization pane bidirectionally bound to the editor cursor.

This document is a deep dive into the codebase: what every part is, what it does, how a typical request flows through the system end-to-end, and where to look first when you need to change something.

---

## Table of contents

1. [High-level architecture](#1-high-level-architecture)
2. [Repository layout](#2-repository-layout)
3. [Build, run, and dev environment](#3-build-run-and-dev-environment)
4. [The Vite dev-server auth broker](#4-the-vite-dev-server-auth-broker)
5. [State management — Zustand stores](#5-state-management--zustand-stores)
6. [UI shell and panes](#6-ui-shell-and-panes)
7. [Editor (Monaco) integration](#7-editor-monaco-integration)
8. [Code execution path (Run button → Wandbox)](#8-code-execution-path-run-button--wandbox)
9. [AI assistance — Chat](#9-ai-assistance--chat)
10. [AI assistance — Coding Agent (Litecode-style)](#10-ai-assistance--coding-agent-litecode-style)
11. [Run Visualization pane](#11-run-visualization-pane)
12. [Cursor ↔ visualization binding (Phase 7)](#12-cursor--visualization-binding-phase-7)
13. [Workspace persistence and sharing](#13-workspace-persistence-and-sharing)
14. [End-to-end execution flows](#14-end-to-end-execution-flows)
15. [Extending the IDE](#15-extending-the-ide)

---

## 1. High-level architecture

CodeScope is a **purely client-side React/TypeScript SPA** with one exception: a small **dev-only Node middleware** lives inside the Vite dev server and acts as an Azure-AD broker + a CORS-bypass proxy for Azure AI Foundry.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          BROWSER (SPA)                               │
│                                                                      │
│  React tree (App.tsx)                                                │
│  ├── Toolbar / Sidebar / TabBar                                      │
│  ├── EditorPane (Monaco)                                             │
│  ├── OutputPanel (Run results + stdin)                               │
│  ├── RunVizPanel (Phase 6/7 visualization)                           │
│  └── AIAssistPanel (Chat tab + Agent tab + DiffPreviewModal)         │
│                                                                      │
│  Zustand stores (single source of truth, persisted to localStorage)  │
│  ├── workspaceStore  — files, tabs, active file, stdin               │
│  ├── settingsStore   — theme, fonts, pane sizes                      │
│  ├── runStore        — last execution result                         │
│  ├── vizStore        — viz state machine + transport + cursor binding│
│  ├── aiStore         — chat history + provider router                │
│  ├── agentStore      — coding-agent run state                        │
│  ├── agentMemoryStore — 4-entry ring buffer                          │
│  ├── agentContextStore — cached project/folder context map           │
│  └── auth            — Azure AAD identity state                      │
│                                                                      │
└────────────┬────────────────────────────┬─────────────────────────────┘
             │                            │
             │  POST /foundry             │  POST https://wandbox.org/api/compile.json
             ▼                            ▼
   ┌────────────────────────┐    ┌──────────────────────────┐
   │ Vite dev plugin:       │    │  Wandbox public API      │
   │ server/auth-broker.ts  │    │  (no key, CORS-enabled)  │
   │  - /auth/me            │    └──────────────────────────┘
   │  - /auth/token         │
   │  - /auth/signout       │              ┌──────────────────────────┐
   │  - /foundry (proxy)    │──────POST───▶│  Azure AI Foundry        │
   │  Mints AAD token via   │  + AAD       │  Responses API           │
   │  DefaultAzureCredential│              └──────────────────────────┘
   └────────────────────────┘
```

### Why this shape?

- **Browser-first** — the workspace lives in `localStorage` and the user can run code without ever logging into anything (Wandbox is anonymous).
- **One Zustand slice per concern** — every pane subscribes only to the slices it needs, so a Monaco edit doesn't re-render the Run Viz pane and vice-versa.
- **Auth broker is a dev convenience** — `DefaultAzureCredential` is Node-only, and Foundry doesn't send CORS headers for `localhost`. The broker mints the token in Node and proxies the upstream call, keeping the bearer out of the browser entirely.

---

## 2. Repository layout

```
CodeScope/
├── server/
│   └── auth-broker.ts            # Vite plugin: /auth/* + /foundry proxy (dev only)
├── src/
│   ├── main.tsx                  # ReactDOM bootstrap
│   ├── App.tsx                   # Top-level layout, global shortcuts, share-URL hydration
│   ├── types.ts                  # FileNode, LanguageMeta, RunResult, TabState
│   ├── styles/global.css         # Theme tokens + viz styles + decorations
│   │
│   ├── components/               # Pure presentational + small interactive units
│   │   ├── Toolbar/              #   Run / language / theme / share / download
│   │   ├── Sidebar/              #   File tree (create/rename/delete)
│   │   ├── TabBar/               #   Open-tabs strip
│   │   ├── EditorPane/           #   Monaco wrapper + viz↔cursor binding
│   │   ├── OutputPanel/          #   Run output + stdin tab
│   │   ├── StatusBar/            #   Bottom strip
│   │   ├── RunVizPanel/          #   Visualization toolbar + canvas + scrubber
│   │   ├── AIAssistPanel/        #   Chat tab + Agent tab + tab strip
│   │   ├── DiffPreviewModal/     #   Agent-diff approval modal
│   │   ├── AuthChip/             #   Azure account chip (toolbar + AI panel)
│   │   ├── SidebarResizer/       #   Drag handles
│   │   ├── OutputResizer/
│   │   ├── RightPaneResizer/
│   │   └── RightSplitResizer/
│   │
│   ├── store/                    # Zustand stores (single source of truth)
│   │   ├── workspaceStore.ts     #   files / tabs / activeFileId / stdin / agent-edit apply
│   │   ├── settingsStore.ts      #   theme, fonts, pane sizes (persisted)
│   │   ├── runStore.ts           #   isRunning / result / error
│   │   ├── vizStore.ts           #   viz state machine + cursor-binding helpers
│   │   ├── aiStore.ts            #   chat history + callProvider() router
│   │   ├── agentStore.ts         #   agent run lifecycle, log, pendingEdits
│   │   ├── agentMemoryStore.ts   #   4-entry ring (persisted)
│   │   └── agentContextStore.ts  #   cached project/folder context map
│   │
│   ├── lib/                      # Side-effecting utilities + transport clients
│   │   ├── languages.ts          #   LANGUAGES table + getLanguage / detectLanguageFromFilename
│   │   ├── wandbox.ts            #   POST /api/compile.json + compiler resolution
│   │   ├── piston.ts             #   Legacy Piston client (kept for reference)
│   │   ├── foundry.ts            #   chat() → POST /foundry (broker-proxied)
│   │   ├── openai.ts             #   chat() → OpenAI Chat Completions (fallback)
│   │   ├── auth.ts               #   useAuth store, polls /auth/me
│   │   ├── share.ts              #   LZ-string-encoded workspace ↔ URL
│   │   ├── download.ts           #   Single-file + JSZip workspace download
│   │   ├── hash.ts               #   djb2 fingerprint (viz stale-source detect)
│   │   └── uid.ts                #   Random short id
│   │
│   ├── viz/                      # Phase 6/7 — visualization pipeline
│   │   ├── types.ts              #   VizCategory, VizPlan, VizEvent (+ line tag), VizTrace
│   │   ├── prompts.ts            #   Planner + simulator system prompts; __VIZ__ protocol
│   │   ├── planner.ts            #   LLM call → VizPlan (with one retry)
│   │   ├── runner.ts             #   Wandbox execution + __VIZ__:{json} parsing
│   │   ├── simulator.ts          #   LLM fallback when runner has no events
│   │   ├── orchestrator.ts       #   plan → runner → (simulator if empty)
│   │   ├── animator.ts           #   Per-category state reducers; stateAt()
│   │   └── renderers/            #   SVG renderers per category
│   │       ├── index.tsx         #     Dispatcher
│   │       ├── Graph.tsx
│   │       ├── Tree.tsx
│   │       ├── ArraySort.tsx
│   │       ├── Grid.tsx
│   │       ├── LinkedList.tsx
│   │       ├── RecursionTree.tsx
│   │       ├── StackQueue.tsx
│   │       └── common.ts         #     stateClass, circularLayout, NODE_R
│   │
│   └── agent/                    # Phase 5 — Litecode-style coding agent
│       ├── types.ts              #   FileOp, Task, PlannerOutput, ExecutorEdit, MemoryEntry
│       ├── tokens.ts             #   countTokens, canFit, availableForCode (8k budget)
│       ├── memory.ts             #   formatMemoryBlock, pushMemory
│       ├── contextMap.ts         #   project + folder + file_analysis markdown builders
│       ├── planner.ts            #   LLM → PlannerOutput (JSON validated, retry, cycle check)
│       ├── executor.ts           #   Per-task LLM → ExecutorEdit (full new file content)
│       ├── orchestrator.ts       #   topo-sort tasks → wave scheduler with concurrency cap
│       └── diff.ts               #   Hand-rolled LCS line diff for the preview modal
│
├── index.html                    # Vite entry
├── package.json                  # React 18, Vite 5, Monaco, Zustand, jszip, lz-string, lucide
├── vite.config.ts                # Plugins: react + auth-broker; manualChunks: monaco
└── README.md                     # User-facing documentation
```

The split is intentional:

| Folder | Layer | Pure? | Side effects? |
| --- | --- | --- | --- |
| `components/` | View | Yes (mostly) | Reads stores, calls actions |
| `store/` | State | No (Zustand) | localStorage persistence |
| `lib/` | Transport / utility | No | Network I/O |
| `viz/` | Domain pipeline | Mix | LLM + Wandbox calls |
| `agent/` | Domain pipeline | Mix | LLM calls; never touches workspace directly |
| `server/` | Dev backend | No | Azure AAD + Foundry proxy |

---

## 3. Build, run, and dev environment

### Tech stack

- **React 18 + TypeScript 5.6** — strict mode on.
- **Vite 5** — dev server + build. Monaco is split into its own chunk via `manualChunks`.
- **Monaco Editor** — loaded from `cdn.jsdelivr.net` so we don't bundle it ourselves.
- **Zustand 4.5** — chosen over Redux/Context for the per-slice subscription model.
- **lucide-react** — icon set (single SVG-per-import, tree-shakeable).
- **lz-string** — workspace URL compression.
- **jszip** — workspace ZIP download.
- **@azure/identity** — *only used by the dev server*, not bundled into the SPA.

### Scripts (`package.json`)

```bash
npm install
npm run dev      # vite — opens http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run preview  # vite preview — serves the build
```

### Environment variables (all `VITE_*` are public, baked into the bundle)

| Var | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_WANDBOX_URL` | `lib/wandbox.ts` | `https://wandbox.org/api` | Override the Wandbox endpoint. |
| `VITE_FOUNDRY_ENDPOINT` | `lib/foundry.ts` + broker | `defaultfoundryresource…` | Foundry deployment URL. |
| `VITE_FOUNDRY_DEPLOYMENT` | `lib/foundry.ts` | `gpt-5.3-codex` | Model deployment name, surfaced in UI. |
| `VITE_OPENAI_API_KEY` | `lib/openai.ts` | (none) | Enables OpenAI fallback. **Bundled** — local dev only. |
| `VITE_DISABLE_FOUNDRY` | `server/auth-broker.ts` | (off) | `=1` disables broker entirely (CI / offline). |
| `VITE_AGENT_MAX_CONCURRENCY` | `agent/orchestrator.ts` | `6` | Max parallel executor calls per wave. |
| `VITE_VIZ_MAX_STEPS` | `viz/runner.ts` | `500` | Cap on emitted VizEvents per trace. |

---

## 4. The Vite dev-server auth broker

**File:** `server/auth-broker.ts` — registered as a Vite plugin in `vite.config.ts`.

### Why a broker?

Azure AI Foundry is a CORS-restricted Cognitive Services endpoint. Two consequences:

1. The browser cannot call `https://*.cognitiveservices.azure.com/...` directly from `localhost`.
2. `DefaultAzureCredential` (`az login`, VS Code Azure, env vars, Managed Identity) is **Node-only** — no browser equivalent without registering an MSAL.js client.

The broker solves both: it minds an in-process `DefaultAzureCredential`, mints a bearer for `https://cognitiveservices.azure.com/.default`, and proxies the request server-side. The bearer never touches the browser.

### Endpoints (all 127.0.0.1-only)

| Endpoint | Method | Returns |
| --- | --- | --- |
| `/auth/me` | GET | `{ signedIn, upn, name, tenantId, expiresOn }` (decoded from JWT claims) |
| `/auth/token` | GET | Raw bearer + expiry — currently unused by the SPA but kept for diagnostics |
| `/auth/signout` | POST | Drops the cached token |
| `/foundry` | POST | Proxies `{ endpoint, payload }` to Foundry with `Authorization: Bearer <token>` |

### Token lifecycle

- `ensureToken()` reuses the cached `AccessToken` until `expiresOnTimestamp - 60s`, then refreshes.
- A 401 from Foundry drops the cache so the next call refreshes.
- At plugin start the broker tries to mint a token and logs the resolved UPN — so you can see in the terminal that you're signed in.

### Security caveats

The broker is **dev-only** (`apply: 'serve'`). Anyone on `localhost` can use it. Production deployments of CodeScope must front Foundry with a real authenticated backend.

---

## 5. State management — Zustand stores

Each store is a Zustand `create(...)` returning a hook, with selective `persist()` for the bits that should survive page reloads.

### `workspaceStore` — files, tabs, active file, agent edits

The most important store. Persisted under `web-ide.workspace.v1`.

State:

- `files: Record<string, FileNode>` — id → file. `FileNode = { id, path, language, content, createdAt, updatedAt }`.
- `fileOrder: string[]` — sidebar ordering.
- `tabs: TabState[]` — open tabs, each `{ fileId, dirty }`.
- `activeFileId: string | null` — currently focused file.
- `stdinByFileId: Record<string, string>` — per-file stdin (used by both Run and instrumented run).

Actions of note:

- **`createFile(path?, language?, content?)`** — auto-renames duplicates (`main.js` → `main-2.js`), opens a tab, focuses it.
- **`setLanguage(id, language)`** — *destructive*: replaces the file content with the new language's `starterCode` and renames the extension. This decision was deliberate (see in-code comment): keeping old content while flipping Monaco's language mode produced "stuck on the old language" UX bugs. To preserve content, the user renames the file extension instead.
- **`updateContent(id, content)`** — short-circuits when content is unchanged (avoids re-render storms from Monaco's `onChange`).
- **`replaceWorkspace(files, activeId)`** — used by share-URL hydration.
- **`resetWorkspace()`** — creates a single starter `main.js` file. Called when the persisted workspace is empty after rehydration.
- **`applyAgentEdits(edits)`** — atomically applies a batch of `ExecutorEdit`s inside a single `set()` so tabs/UI/Monaco update once. Handles `create` / `edit` / `rename` / `delete`, skips edits with `error`, returns the list of paths actually written (for memory entries). Files referenced by path that no longer exist are silently skipped (the user already saw the diff).

A dev-only `window.__workspace` hook is exposed under `import.meta.env.DEV` for smoke tests.

### `settingsStore` — theme, fonts, pane sizes

Persisted under `web-ide.settings.v1`. Holds `theme`, `fontSize`, `uiFont`, `editorFont`, and the pixel sizes of every resizer (`sidebarWidth`, `outputHeight`, `rightPaneWidth`, `rightTopHeight`). Enforces sane min/max via clamping setters.

Two predefined font tables (`UI_FONTS`, `EDITOR_FONTS`) are exported for the dropdowns.

### `runStore` — Run button result

Tiny: `{ isRunning, result, error }` plus setters. Not persisted — runs are ephemeral.

### `vizStore` — visualization state machine

See [section 11](#11-run-visualization-pane). Holds the plan/trace, transport (`currentStep`, `playing`, `speed`, `_timer`), cursor-binding fields (`followCode`, `vizFileId`, `vizSourceHash`, `staleSource`, `_lineIndex`), and the `_abort` controller for the in-flight orchestrator.

### `aiStore` — chat history + provider router

Persisted (`web-ide.ai.v1`), with a `partialize` that caps to the last 50 messages.

The **`callProvider({ instructions, messages, signal })`** export is the one shared entry point used by **chat, the agent planner/executor, the viz planner, and the viz simulator**. Provider precedence:

1. **Foundry** (if `useAuth.signedIn`) → POST `/foundry` via the dev broker.
2. **OpenAI** (if `VITE_OPENAI_API_KEY`) → POST `https://api.openai.com/v1/chat/completions` directly.
3. **None** → throws with a "sign in or set key" message that the UI surfaces.

This gives every LLM-calling subsystem the same provider abstraction.

### `agentStore` — coding-agent lifecycle

State machine: `idle → planning → executing → previewing → applying → idle | error | cancelled`. Holds the live `current: AgentRun`, append-only `logs[]` (capped to 200), `pendingEdits[]` for the diff modal, and the `abort: AbortController` so the user can cancel mid-run.

### `agentMemoryStore` — 4-entry ring

Persisted ring buffer; `push()` keeps only the last 4. Mirrors Litecode's `.litecode/memory.json` but lives in `localStorage` because the browser has no real filesystem.

### `agentContextStore` — cached project/folder context

Lazy cache keyed by a stable workspace hash. Subscribes to `workspaceStore` changes and invalidates on `files` / `fileOrder` mutation. The actual context-map computation lives in `agent/contextMap.ts`.

### `useAuth` (`lib/auth.ts`)

Polls `GET /auth/me` to surface signed-in identity. Auto-refreshes on first import (`void useAuth.getState().refresh()`). Drives the `AuthChip` and the `selectProvider()` router.

---

## 6. UI shell and panes

### `App.tsx`

Top-level grid laid out with CSS variables (`--sidebar-w`, `--right-w`, `--ui-fs`, `--font-ui-sel`, `--font-mono-sel`) so the resizers can update sizes via Zustand without re-rendering the whole tree.

Mount-time effects:

1. **Theme** — applies `data-theme="dark|light"` to `<html>` so global.css tokens flip.
2. **Share-URL hydration** — `readShareFromUrl()` decodes any `?s=…` payload via LZ-string, prompts the user, and calls `replaceWorkspace`. Otherwise falls back to `resetWorkspace()` if the persisted workspace is empty.
3. **Right column initial split** — measures the right column once and sets `rightTopHeight` to 75 %.
4. **Global shortcuts** — `Ctrl+Enter` runs the active file via Wandbox; `Ctrl+S` is a no-op (autosave is implicit); `Alt+= / Alt+- / Alt+0` adjusts editor font size.

### Pane layout

```
┌──────────────────────────────────────────────────────────────────┐
│                            Toolbar                               │
├────────┬───────────────────────────────────────┬─────────────────┤
│ Side-  │  Tab bar                              │  Run            │
│ bar    ├───────────────────────────────────────┤  Visualization  │
│        │  Editor (Monaco)                      │                 │
│ Files  │                                       ├─────────────────┤
│        ├───────────────────────────────────────┤  AI Assistance  │
│        │  Output / Input                       │  (Chat | Agent) │
└────────┴───────────────────────────────────────┴─────────────────┘
                            Status bar
```

Resizers (`SidebarResizer`, `OutputResizer`, `RightPaneResizer`, `RightSplitResizer`) are tiny mouse-drag components that just update the relevant Zustand setter. Double-click resets to defaults.

### `Toolbar`

- Run button (Wandbox).
- Language picker (calls `setLanguage` — see "destructive language change" caveat above).
- Theme toggle, font controls.
- Share (LZ-string-encoded URL → clipboard).
- Download (single file or whole workspace as ZIP via JSZip).
- `AuthChip` for Azure sign-in status.

### `Sidebar`

File tree with create/rename/delete. Uses `prompt()` and `confirm()` for simplicity (kept intentional — no modal heaviness).

### `TabBar`

Open-tabs strip; closing the active tab falls back to the previous tab in `closeTab`'s logic.

### `OutputPanel`

Two tabs: **Output** (stdout + stderr from `runStore.result`) and **Input** (per-file stdin, fed back into the next Wandbox run).

### `StatusBar`

Bottom strip — language label, line/col, error chip if present.

### `AIAssistPanel`

Hosts two tabs (**Chat** and **Agent**) plus the `DiffPreviewModal` (modal lives at panel scope so it overlays the whole IDE via fixed positioning). Auto-displays a "no AI provider" banner with sign-in instructions if `selectProvider() === 'none'`.

### `RunVizPanel`

The visualization toolbar + canvas + scrubber. Detail in [section 11](#11-run-visualization-pane).

---

## 7. Editor (Monaco) integration

**File:** `src/components/EditorPane/EditorPane.tsx`.

Wraps `@monaco-editor/react` with three behaviors:

1. **Reactive props** — `language`, `theme`, `value`, `path`, `fontSize`, `fontFamily` all flow from stores. `automaticLayout: true` plus a manual `editor.layout()` on font changes covers all resize cases.
2. **Two-way edit binding** — `onChange` calls `workspace.updateContent(file.id, v ?? '')`.
3. **Bidirectional cursor↔viz binding** (Phase 7 — see [section 12](#12-cursor--visualization-binding-phase-7)).

The Monaco loader is pinned to a CDN URL:

```ts
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs' } });
```

This avoids bundling Monaco's huge worker binaries; the trade-off is that the IDE needs network access on first load.

Editor options enabled:

- `minimap: false`, `wordWrap: 'on'`, `tabSize: 2`, `scrollBeyondLastLine: false`
- `glyphMargin: true` — required for the executing-line gutter pip
- `fontLigatures: true`, `renderWhitespace: 'selection'`

---

## 8. Code execution path (Run button → Wandbox)

**File:** `src/lib/wandbox.ts`.

### Compiler resolution

Each `LanguageMeta` in `lib/languages.ts` declares a preferred `wandboxCompiler` (e.g. `gcc-13.2.0`). Because Wandbox rotates compilers, `resolveCompiler()` falls back gracefully:

1. Exact name match.
2. Same prefix family (e.g. `rust-1.82.0` if `rust-head` is gone).
3. Same `language` label.

The `/list.json` response is memoized in-process (`compilersCache`) so subsequent runs only POST `/compile.json`.

### `execute()`

POST `/compile.json` with `{ compiler, code, stdin, save: false }`. The response shape is:

```ts
{
  status?: string;            // exit code as string
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
}
```

Mapped into `RunResult { stdout, stderr, exitCode, language, version, timeMs }`. Compile errors are prefixed `[compile]\n…` and merged into `stderr`. Signal kills are appended as `[signal] SIGFOO`.

Rate-limit (HTTP 429) gets a friendly error message; everything else throws with status text.

### Run flow

`Toolbar.onRun()` (or `Ctrl+Enter` in `App.tsx`) →
- `runStore.setRunning(true)`
- `execute({ language, code, stdin })`
- on success: `setResult(result)` → `OutputPanel` re-renders
- on error: `setError(err.message)`
- finally: `setRunning(false)`

The same `execute()` is reused by the visualization runner (`viz/runner.ts`).

---

## 9. AI assistance — Chat

**Files:** `src/store/aiStore.ts`, `src/components/AIAssistPanel/ChatTab.tsx`.

A thin chat interface around `callProvider()`:

- A system prompt is built from the active file's path, language, and (truncated to 6 KB) content.
- History is persisted (cap 50 messages).
- `send(prompt, ctx)` appends the user message, calls the LLM, appends the assistant reply.
- Errors surface inline; cancellation isn't supported on the chat path (only the agent path uses `AbortController`).

Provider selection is **automatic and silent** — `selectProvider()` returns `'foundry' | 'openai' | 'none'` and the chat tab shows the chosen provider in its header.

---

## 10. AI assistance — Coding Agent (Litecode-style)

The agent is a faithful adaptation of [`razvanneculai/litecode`](https://github.com/razvanneculai/litecode) v1.1 to a browser environment.

### Pipeline

```
user request ──▶ context map ──▶ planner ──▶ orchestrator ──▶ executor (×N) ──▶ DiffPreviewModal ──▶ apply
                  (cached)        (LLM)       (topo-sort)       (LLM/task)        (user accept)      (memory push)
```

### `agent/contextMap.ts` — three-layer context

- **`project`** — root markdown listing every file with size, language, and a short heuristic summary.
- **`folders[]`** — per-folder markdown listing files in that folder.
- **`analyses{path}`** — per-file chunk index for files over `LARGE_FILE_LINE_THRESHOLD = 150` lines, with chunk descriptors `{ startLine, endLine, summary }`. Used by `loadSection()` when the executor can't fit the whole file in budget.

The context map is built lazily and cached in `agentContextStore`, keyed by a stable workspace hash; it's invalidated when `files` / `fileOrder` change.

### `agent/tokens.ts` — 8 KB budget gate

Token counting is the cheap `chars / 4` heuristic plus a 5 % pad on code-shaped strings (`/[{};=<>]/` + length > 40). Drops in priority order:

1. Folder context.
2. Memory.
3. Caller-mediated: swap full file for a section via `loadSection()`.

If still over budget, returns `fits: false` and the caller surfaces an error.

### `agent/planner.ts`

System prompt (`PLANNER_SYSTEM`) is a strict JSON schema:

```json
{
  "synthesis": "<one sentence>",
  "tasks": [
    { "id": "t1", "path": "...", "newPath": "...?", "op": "edit|create|rename|delete", "hint": "...", "deps": [...], "language": "..." }
  ]
}
```

Validation: unique IDs, all `deps` reference earlier IDs, no cycles (DFS coloring), `op === 'rename'` requires `newPath`. One automatic retry on malformed JSON with an explicit reminder.

### `agent/orchestrator.ts`

Pure TypeScript wave scheduler:

1. **`topoWaves()`** — Kahn's algorithm, groups mutually independent tasks into waves.
2. **`runWave()`** — within a wave, runs executors in parallel under `VITE_AGENT_MAX_CONCURRENCY` (default 6) using a worker-pool pattern.
3. Between waves, awaits all of the previous wave so dependent tasks see fresh state.
4. Single `AbortSignal` is checked at every loop and propagated to `execute()`.

### `agent/executor.ts`

For each task:

1. **Trivial cases short-circuit** — `delete` returns `{ content: '' }` immediately; `rename` without "content" in the hint also skips the LLM.
2. Computes the **prompt budget** (`availableForCode`), decides between the **full file** and a **`loadSection()`** chunk.
3. Builds the user prompt with task id / op / path / hint / current contents (or section).
4. `callProvider()` → JSON `{ "content": "<full new file>" }`. Tolerant parser strips fences and finds the first `{...}` block.
5. Returns `ExecutorEdit { taskId, path, newPath?, op, content, language?, error? }`.

Errors per task are stored in `error`; the orchestrator continues other tasks regardless.

### `agent/diff.ts`

Hand-rolled LCS line diff (no `jsdiff` dependency, ~30 KB saved). Files over `LCS_LINE_CAP = 4000` lines get a synthetic full-replace hunk to avoid O(N×M) blowups. Output: `DiffHunk[]` with `oldStart` / `newStart` / `lines: { kind: ' '|'+'|'-' , text }[]`.

### `DiffPreviewModal.tsx`

Opens automatically when `agentStore.pendingEdits` becomes non-empty. Per-edit accept toggle (failed edits default to off). On apply:

1. `workspaceStore.applyAgentEdits(selected)` — atomic batch.
2. `pushMemory({ request, synthesis, files: writtenPaths })` — skipped when no files were written.
3. Closes modal, sets agent status back to `idle`.

### `agentStore.ts` lifecycle

`idle → planning → executing → previewing → applying → idle`. Each transition appends an `AgentLogEntry` to a 200-cap append-only log displayed in the Agent tab timeline.

---

## 11. Run Visualization pane

**Files:**
- `src/viz/types.ts`, `prompts.ts`, `planner.ts`, `runner.ts`, `simulator.ts`, `orchestrator.ts`, `animator.ts`
- `src/viz/renderers/*.tsx`
- `src/store/vizStore.ts`
- `src/components/RunVizPanel/RunVizPanel.tsx`

### Pipeline

```
source ──▶ Planner LLM ──▶ VizPlan ──▶ Wandbox ──▶ parse __VIZ__:{json} ──▶ VizTrace ──▶ canvas
                            (with             (instrumented            ┌───▶ if no events
                          instrumented        code)                    │      Simulator LLM
                          code + sample                                 │      → VizTrace
                          input)                                        ▼
                                                                  state reducer
                                                                  → SVG renderer
                                                                  (per category)
```

### Categories supported

| Category | Sample input | Step ops (excerpt) |
| --- | --- | --- |
| `graph` | `{ nodes, edges, directed?, start? }` | visit, enqueue, dequeue, push, pop, set_state, highlight_edge, set_distance, note |
| `tree` | `{ id, value?, children? }` | enter, leave, visit, set_state, highlight_edge, set_value, note |
| `array_sort` | `{ values[] }` | compare, swap, set, mark_sorted, highlight_range, pivot, note |
| `grid` | `{ rows, cols, walls?, start?, goal?, values? }` | visit, set_state, set_value, highlight_path, note |
| `linked_list` | `{ head, nodes[] }` | visit, set_pointer, set_next, insert, delete, note |
| `recursion_call_tree` | `{ rootCall? }` | call, return, highlight, note |
| `stack_queue` | `{ show: ['stack','queue'] }` | push, pop, enqueue, dequeue, peek, note |

Each event is `{ t, …category-specific…, line?: number }` (the `line` field was added in Phase 7 — see [section 12](#12-cursor--visualization-binding-phase-7)).

### `viz/prompts.ts` — the `__VIZ__:` protocol

The planner produces an **instrumented copy** of the source that prints one JSON object per step on its own line, prefixed `__VIZ__:`. The runner scans stdout for this prefix and parses the JSON; everything else is preserved as `cleanStdout`. Rules baked into the prompt:

- Cap probe emissions at `VITE_VIZ_MAX_STEPS` (default 500).
- Hardcode the sample input near the top so no stdin is required.
- Don't "fix" the user's bugs — instrumentation must be behavior-preserving.
- Every probe must include `"line": <1-based original-source line>` (Phase 7).

### `viz/planner.ts` — LLM → `VizPlan`

Calls `callProvider()` with the planner system prompt. Tolerant JSON parsing (strips fences, finds first `{...}`). One automatic retry with a stricter "ONLY JSON" reminder. Validates that the returned `category` is one of the seven and matches `forceCategory` if set.

### `viz/runner.ts` — Wandbox + probe parsing

Sends `plan.instrumentedCode` + `plan.stdin` to `lib/wandbox.execute()`. Splits stdout on `\r?\n`:

- Lines starting with `__VIZ__:` are JSON-parsed and pushed to `events[]` until the cap; `t === 'input'` is dropped (sample input is already in the plan).
- Other lines are accumulated as `cleanStdout`.
- `ranOk = events.length > 0 && (exitCode === 0 || null)`.

If `!ranOk`, the orchestrator falls back to the simulator. Errors never throw out — they're surfaced via `errorOutput`.

### `viz/simulator.ts` — LLM fallback

When the runner produced no events (e.g. compile error, language not on Wandbox, instrumentation failed), the simulator is asked to *mentally run* the code on the chosen sample input and emit the `VizEvent[]` directly. Same retry / parse pattern as the planner. `VizTrace.simulated = true` so the UI can show a "Simulated" badge.

### `viz/orchestrator.ts`

```
plan → run → if ranOk return runner trace else simulate → return
```

Single shared `AbortSignal`. Status callbacks (`'planning' | 'running' | 'simulating'`) drive the toolbar spinner.

### `viz/animator.ts` — pure state reducers

For each category, defines:

- A `State` interface (e.g. `GraphState { input, nodeState, distance, highlightedEdges, frontier, visited, lastNote? }`).
- `xxxInitial(input)` to build the empty-state-zero.
- `applyXxx(state, event)` — pure reducer with one case per `event.t`.

Public helpers:

- `initialState(plan)` — dispatch on `plan.input.category`.
- `applyEvent(plan, state, ev)` — dispatch on category.
- **`stateAt(plan, events, step)`** — replay from initial through `events[0..step-1]`. Renderers call this every render with the current step.

Rebuilding from zero each frame is O(N) but N is bounded by the 500-event cap and renderers memoize via React, so it stays cheap.

### Renderers (`viz/renderers/*.tsx`)

- All return SVG with `viewBox="0 0 W H"`, sized via props.
- Use CSS classes (`.viz-state-frontier`, `.viz-state-visiting`, …) so theme switches cascade automatically.
- `Graph` uses `circularLayout()` for small graphs (cheap & deterministic). Tree uses a recursive layout. Grid is a row/col grid. Recursion tree is a depth-tiered graph. Stack/queue are vertical/horizontal stacks with a `flash` indicator.
- The dispatcher in `renderers/index.tsx` calls `stateAt(plan, events, step)` and forwards the typed state to the right renderer.

### `vizStore.ts` — state machine

Status: `idle → planning → running → simulating → ready → playing ⇄ paused → ready` (with `error` / `cancelled` exits).

Transport actions: `play`, `pause`, `step(±1)`, `seek(n)`, `reset` (back to step 0), `resetAll` (back to idle).

Playback: `setInterval` at `Math.max(20ms, 1000/speed)`. Auto-pauses at the end. Changing speed mid-play restarts the timer.

### `RunVizPanel.tsx`

Three sections inside one flexbox column:

1. **Toolbar** — Visualize / Cancel; Follow code toggle; Force category; transport (back / play / forward / reset / speed).
2. **Stale banner** (Phase 7) — yellow strip with a Re-Visualize button when `staleSource && hasTrace && !busy`.
3. **Status row** — phase spinner + plan rationale + Simulated badge + truncated badge + step counter.
4. **Canvas** — the active renderer, sized via `ResizeObserver` so the SVG fills available space.
5. **Scrubber** — `<input type="range" min=0 max=totalSteps>` calling `seek()`.

---

## 12. Cursor ↔ visualization binding (Phase 7)

The most recently added subsystem. Makes the visualization feel like a second view of the same execution by binding the editor cursor and the viz step *bidirectionally*.

### How

1. Every `VizEvent` carries an optional `line: number` (1-based, in the user's original source). The planner and simulator prompts both **require** this field; older traces without it gracefully no-op.

2. **`buildLineIndex(trace)`** (in `vizStore.ts`) precomputes a sorted `[line, step][]` array, **latest-wins** on duplicate lines (so a cursor on a loop body lands on the most recent iteration).

3. Two pure helpers on `vizStore`:

   - **`stepFromLine(cursorLine)`** — binary search for the largest entry with `line ≤ cursor`. Returns `0` if cursor is above the first event line; `null` if no trace / no line tags.
   - **`lineForStep(step)`** — walks back from `events[step-1]` until it finds one with a `line` tag. Returns `undefined` for step 0 or events without tags.

4. **`EditorPane.tsx`** wires both directions:

   - **Viz → editor** — a `useEffect` watching `currentStep` calls `editor.setPosition(...)` + `revealLineInCenterIfOutsideViewport` and applies a Monaco decoration (`viz-exec-line` background + `viz-exec-glyph` gutter pip) via `editor.createDecorationsCollection()`.
   - **Editor → viz** — `onDidChangeCursorPosition` filters by `e.source === 'mouse' | 'keyboard'` and calls `seek(stepFromLine(line))`.
   - **Loop guard** — `programmaticUpdateRef` boolean ref is set true around any programmatic `setPosition` and released in `queueMicrotask`. Combined with the `e.source` filter, this prevents infinite ping-pong.

5. **Follow code toggle** — `vizStore.followCode` (defaults to `true`). When off, both directions are disabled. The toolbar button uses `Link2` / `Link2Off` icons.

6. **Stale-source detection** — at `startVisualize` time, `vizStore` snapshots the file id (`vizFileId`) and `djb2(file.content)` (`vizSourceHash`). EditorPane has a `useEffect` watching the active file content; on every change it calls `refreshStale(content)` which re-hashes and flips `staleSource` on mismatch. The yellow banner in `RunVizPanel` shows whenever `staleSource && hasTrace && !busy` and offers a one-click Re-Visualize.

7. **File switch** — the binding is gated by `bindingActive = followCode && plan && trace && vizFileId === activeId`. Switching to a non-visualized file tears down the executing-line decoration via `decorationsRef.current?.clear()`.

### Why this design

- **last_le mapping** is continuous — even lines that emit no events show a sensible step (the most recent one before the cursor).
- **Latest-wins on repeats** matches debugger intuition for loop bodies.
- **Pure helpers in the store** make the binding testable from `window.__viz` without spinning Monaco.
- **Backward-compatible** — older traces (no `line` tags) make `_lineIndex` empty → both directions silently no-op; rest of playback works as before.

---

## 13. Workspace persistence and sharing

### Persistence

Three persisted Zustand slices:

| Key | Contents | Cap |
| --- | --- | --- |
| `web-ide.workspace.v1` | files, fileOrder, tabs, activeFileId, stdinByFileId | none |
| `web-ide.settings.v1` | theme, fonts, pane sizes | none |
| `web-ide.ai.v1` | chat messages | last 50 |
| `web-ide.agent.memory.v1` | agent memory ring | last 4 |

The workspace store has an `onRehydrateStorage` hook that calls `resetWorkspace()` when rehydration leaves an empty `fileOrder` — guarantees the user always sees a starter file.

### Share-via-URL (`lib/share.ts`)

```
SharePayload { v: 1, files: FileNode[], activeId: string | null }
  → JSON.stringify
  → LZString.compressToEncodedURIComponent
  → ?s=<compressed>
```

Round-trip via `decodeWorkspace`. URLs over `MAX_URL_LEN = 6000` chars are rejected with a "too large to share" notice. On hydration the user is prompted before the workspace is replaced.

### Download (`lib/download.ts`)

- `downloadFile(file)` — Blob URL + `<a download>` click.
- `downloadWorkspaceZip(files)` — JSZip with one entry per `file.path`.

---

## 14. End-to-end execution flows

### A. Run the active file

```
User clicks Run (or Ctrl+Enter)
  └─▶ Toolbar.onRun() / App keydown handler
        ├─ runStore.setRunning(true)
        ├─ wandbox.execute({ language, code, stdin })
        │     ├─ getCompilers() (cached)
        │     ├─ resolveCompiler(...)
        │     └─ POST /api/compile.json
        ├─ runStore.setResult(RunResult) on success
        ├─ runStore.setError(msg) on failure
        └─ runStore.setRunning(false) (finally)

OutputPanel re-renders with the new result.
```

### B. Send a chat message

```
User types in ChatTab → submits
  └─▶ aiStore.send(prompt, ctx)
        ├─ buildSystemPrompt(ctx)
        ├─ append { role: 'user', content } to messages
        ├─ callProvider({ instructions, messages, signal })
        │     ├─ selectProvider() → 'foundry' | 'openai' | 'none'
        │     ├─ foundry path: POST /foundry → broker → Azure
        │     └─ openai path:  POST api.openai.com/v1/chat/completions
        ├─ append { role: 'assistant', content: reply }
        └─ persist trimmed history (last 50)
```

### C. Run the coding agent

```
User types in AgentTab → clicks Run
  └─▶ agentStore.startRun(req)
        ├─ status = 'planning'
        └─ planner.plan({ request: req, signal })
              ├─ agentContextStore.getOrBuild() → ContextMap
              ├─ memory.formatMemoryBlock()
              ├─ tokens.canFit(...) — drop folder/memory if needed
              ├─ callProvider() — strict JSON contract, retry once
              └─ tryParse() — validate ids/deps/cycles → PlannerOutput

  └─▶ agentStore.setPlan(plan); status = 'executing'
  └─▶ orchestrator.orchestrate({ plan, signal, onTaskComplete })
        ├─ topoWaves(tasks)
        └─ for wave in waves:
              runWave(wave, concurrency=6, signal, onProgress)
                └─ for each task in parallel:
                      executor.execute({ task, signal })
                        ├─ trivial short-circuit for delete / rename-no-content
                        ├─ availableForCode(); maybe loadSection() for huge files
                        ├─ build prompt; callProvider() → JSON { content }
                        └─ return ExecutorEdit
              onProgress logs each completion to agentStore.logs[]

  └─▶ agentStore.setPendingEdits(edits); status = 'previewing'
        └─ DiffPreviewModal opens automatically (mounted in AIAssistPanel)
              ├─ enrichedEdits = pendingEdits.map(e => { hunks, stats })
              ├─ user toggles per-edit acceptance
              └─ onApply:
                    ├─ workspaceStore.applyAgentEdits(selected) — atomic
                    ├─ pushMemory({ request, synthesis, files: writtenPaths })
                    ├─ clearPendingEdits()
                    └─ status = 'idle'
```

### D. Visualize the active file

```
User clicks Visualize in RunVizPanel
  └─▶ vizStore.startVisualize()
        ├─ snapshot vizFileId + djb2(content); status = 'planning'
        └─ orchestrator.orchestrateVisualization({ language, code, ... })
              ├─ planner.planVisualization() → VizPlan { category, input, instrumentedCode, stdin }
              ├─ status = 'running'
              ├─ runner.runInstrumented(plan, signal)
              │     ├─ wandbox.execute(plan.instrumentedCode, plan.stdin)
              │     └─ parse __VIZ__:{json} lines → events[]
              └─ if !ranOk:
                    status = 'simulating'
                    simulator.simulateTrace(plan, originalCode)

  └─▶ status = 'ready'; trace = { events, truncated, simulated }
        ├─ buildLineIndex(trace) — sorted [line, step][] for cursor binding
        └─ currentStep = 0

User scrubs / plays / steps:
  └─▶ vizStore.seek(n) / play() / step(±1) → currentStep changes
        ├─ RunVizPanel re-renders → VisualizationRenderer
        │     └─ stateAt(plan, events, step) → AnyVizState → SVG
        └─ EditorPane (Phase 7):
              ├─ useEffect on currentStep:
              │     ├─ targetLine = lineForStep(currentStep)
              │     ├─ decorationsRef.set({ viz-exec-line, viz-exec-glyph })
              │     └─ programmaticUpdateRef = true; setPosition; reveal
              └─ useEffect on file content: refreshStale(content) → staleSource

User moves cursor in editor:
  └─▶ onDidChangeCursorPosition (mouse/keyboard only)
        ├─ if !bindingActive or programmaticUpdateRef → ignore
        └─ target = stepFromLine(line); if target !== currentStep → seek(target)

User edits visualized file:
  └─▶ EditorPane useEffect → refreshStale(newContent)
        └─ vizStore.staleSource = (djb2(new) !== vizSourceHash)
              └─ RunVizPanel shows yellow banner with Re-Visualize button
```

### E. Authenticate to Foundry

```
Vite dev server starts
  └─▶ auth-broker plugin: ensureToken(state)
        └─ DefaultAzureCredential.getToken('https://cognitiveservices.azure.com/.default')
              └─ tries: AZURE_* env → ManagedIdentity → AzureCli (`az login`) → VS Code → ...

Browser loads SPA → useAuth.refresh() (auto on import)
  └─▶ GET /auth/me → broker decodes JWT claims → { signedIn, upn, name, tenantId }
        └─ useAuth state populated

User asks chat / agent / viz to call LLM
  └─▶ callProvider() → selectProvider() → 'foundry'
        └─ foundry.chat({ instructions, messages })
              └─ POST /foundry { endpoint, payload }
                    └─ broker: ensureToken → fetch(endpoint, Authorization: Bearer ...)
                          └─ proxies upstream response back to browser
```

---

## 15. Extending the IDE

### Adding a language

1. Append to `LANGUAGES` in `src/lib/languages.ts` with `monacoId`, `wandboxCompiler`, `defaultFilename`, `fileExtension`, `runnable`, `starterCode`.
2. Add the literal to `LanguageId` in `src/types.ts`.
3. The toolbar dropdown picks it up automatically. If `runnable: false`, no Wandbox call is made (handy for HTML/CSS/JSON/Markdown/SQL).

### Adding a visualization category

1. Add a literal to `VizCategory` and the labels map in `src/viz/types.ts`.
2. Add the input shape (interface), the event union, and an entry in `VizEvent`'s discriminated union.
3. Add the vocab block to `CATEGORY_VOCAB` in `src/viz/prompts.ts` — this is what teaches the planner what JSON to emit.
4. Add a `State` interface, `xxxInitial`, `applyXxx` reducer to `src/viz/animator.ts`, and wire them into `initialState` / `applyEvent`.
5. Create `src/viz/renderers/Foo.tsx` (SVG, takes `state, width, height`).
6. Add a case to the dispatcher in `src/viz/renderers/index.tsx`.

### Adding an LLM call site

Use `callProvider({ instructions, messages, signal })` from `src/store/aiStore.ts`. Don't talk to Foundry / OpenAI directly; the router already handles provider selection, the broker proxy, and error normalization.

### Adding a global shortcut

Append a branch to the keydown handler in `App.tsx`. Use `e.preventDefault()` so Monaco doesn't swallow it. Test that it doesn't fire while typing in an `<input>`.

### Persisting new state

Wrap the Zustand slice with `persist({ name, version, partialize? })`. Bump `version` and provide a `migrate` if you change the shape; otherwise users get reset state silently.

### Smoke-testing

Run `npm run dev`. In a browser console with the dev build, both stores are exposed:

```js
window.__workspace.getState().createFile('demo.py', 'python', 'print(1)');
window.__viz.getState().startVisualize();
```

Both hooks are gated by `import.meta.env.DEV` so production bundles don't expose them.

---

## Appendix: dependency rationale

| Dep | Why it was chosen |
| --- | --- |
| **React 18** | Concurrent rendering, `useId`, broad ecosystem. |
| **Vite 5** | Fastest TS dev loop; native ESM; plugin model that supports the dev-only auth broker as middleware. |
| **TypeScript 5.6** | Strict mode + discriminated unions for `VizEvent` are essential. |
| **Monaco** | Same editor engine as VS Code — users already know it. CDN-loaded to avoid bundling 5+ MB of workers. |
| **Zustand** | Per-slice selector subscriptions keep panes independent; trivial to expose store on `window` for debugging; `persist` middleware is built in. |
| **lucide-react** | Tree-shakeable SVG icons; one import per icon = no font-icon bloat. |
| **lz-string** | LZW-style compression with a tight URI-safe encoding — perfect for share URLs. |
| **jszip** | Workspace ZIP download in pure JS. |
| **@azure/identity** | Used **only** in the dev server (`server/auth-broker.ts`); never bundled into the SPA. |

---

*This document reflects the codebase through Phase 7 (cursor-bound visualization). Future phases should extend the relevant section above and add a new entry to the end-to-end flows.*
