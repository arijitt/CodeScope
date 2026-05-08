            # Web-Based IDE — Implementation Plan

## Problem
Build a browser-based IDE with a language selector supporting 15 languages, code execution via a free public API, and core IDE features (tabs, file tree, persistence, sharing, theming, light/dark themes).

## Approach
Single-page React + Vite app using Monaco Editor. State managed via Zustand (lightweight) with `persist` middleware. Code execution via the free public **[Wandbox](https://wandbox.org/)** API (CORS-enabled, no API key, all 11 runnable languages supported). Sharing via URL using lz-string–compressed workspace payloads.

## Tech Stack
- **Build**: Vite + React 18 + TypeScript
- **Editor**: `@monaco-editor/react` (Monaco loaded from CDN to keep bundle small)
- **State**: Zustand + `persist` middleware (localStorage)
- **Styling**: CSS variables for theming (light/dark)
- **Execution**: Wandbox public API (default; endpoint overridable via `VITE_WANDBOX_URL`)
- **Sharing**: `lz-string` for URL-safe compression
- **Packaging**: `jszip` for workspace ZIP export
- **Icons**: `lucide-react`

## Architecture
```
src/
├── main.tsx                 # entrypoint
├── App.tsx                  # layout shell, share-URL hydration, Ctrl+Enter shortcut
├── components/
│   ├── Sidebar/             # file list (new/rename/delete) — NO language selector
│   ├── TabBar/              # open file tabs
│   ├── EditorPane/          # Monaco wrapper (CDN loader)
│   ├── OutputPanel/         # run output / stderr / exit code / timing
│   ├── Toolbar/             # SINGLE language selector, Run, Share, Download, Theme
│   └── StatusBar/           # filename, language, line count, font size
├── store/
│   ├── workspaceStore.ts    # files, tabs, active file (persisted)
│   ├── settingsStore.ts     # theme, font size (persisted)
│   └── runStore.ts          # transient run state (isRunning, result, error)
├── lib/
│   ├── languages.ts         # 15 LanguageMeta entries (Piston + Wandbox IDs, HelloWorld starters)
│   ├── wandbox.ts           # active execute() client — Wandbox /list.json + /compile.json
│   ├── piston.ts            # legacy execute() client — kept for self-hosted Piston users
│   ├── share.ts             # encode/decode workspace ↔ URL (lz-string)
│   ├── download.ts          # single-file blob + workspace ZIP export
│   └── uid.ts               # short unique IDs
└── types.ts                 # FileNode, TabState, RunResult, LanguageMeta
```

## Language Configuration
Each `LanguageMeta`: `{ id, label, monacoId, pistonRuntime, wandboxCompiler, defaultFilename, fileExtension, starterCode, runnable }`. Wandbox compiler IDs are pinned to verified-working stable versions (e.g. `nodejs-20.17.0`, `cpython-3.13.8`, `gcc-13.2.0`, `rust-1.82.0`, `sqlite-3.46.1`); the client falls back to the newest same-family compiler if a pinned version disappears.

## Key Flows
1. **Edit**: Monaco → debounced update to `workspaceStore` → autosave to localStorage.
2. **Switch language** (toolbar — *single source of truth*): updates active file's language, swaps in the new HelloWorld when content is empty or still a starter (preserves user code), renames file extension, Monaco re-tokenizes.
3. **Run**: POST file content to Wandbox `/compile.json` → display stdout/stderr/exit code/timing in OutputPanel. Triggered by Run button or `Ctrl+Enter`.
4. **Files**: New/rename/delete in sidebar; new files inherit active file's language and are seeded with its HelloWorld.
5. **Tabs**: Open/close, click to activate, dirty indicator.
6. **Share**: Serialize workspace → lz-string compress → `?s=<payload>` URL; on load, prompt to hydrate.
7. **Download**: Single file as blob, or whole workspace as ZIP via `jszip`.
8. **Theme**: Light/dark toggle drives `data-theme` on `<html>` + Monaco theme.

## HelloWorld Starters (per language)
Defined in `src/lib/languages.ts` as `starterCode` on each `LanguageMeta`. Used in two places:
1. New files created via the sidebar are seeded with the selected language's HelloWorld.
2. The toolbar language selector swaps the active file's content to the new language's HelloWorld **only when** the file is empty/whitespace OR the content still matches some language's starter (so user-modified code is never overwritten). The file extension is renamed to match the new language.

Languages covered: JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby, PHP, HTML, CSS, JSON, Markdown, SQL. Java starter uses `class Main` (not `public class Main`) because Wandbox saves source as `prog.java`.

## Todos
1. `scaffold` — Vite + React + TS project, deps, base layout ✅
2. `languages-config` — 15 `LanguageMeta` entries with Wandbox + Piston IDs and HelloWorld starters ✅
3. `editor-pane` — Monaco integration (CDN loader) with language switching ✅
4. `workspace-store` — Zustand store + localStorage persistence; smart `setLanguage` HelloWorld swap + extension rename ✅
5. `file-tree` — sidebar with new/rename/delete (language selector removed; lives only in toolbar) ✅
6. `tab-bar` — open files, switch active, close ✅
7. `toolbar` — **single** language selector, Run, theme, share, download ✅
8. `wandbox-client` — execute() + compiler resolution + fallback for missing pinned versions ✅
9. `piston-client` (legacy) — kept for self-hosted Piston users; `VITE_PISTON_URL` env var ✅
10. `output-panel` — stdout/stderr/exit code/timing, loading state ✅
11. `theme` — light/dark via CSS variables, sync Monaco theme ✅
12. `share-url` — encode/decode workspace, hydrate on load with confirm prompt ✅
13. `download` — single file + workspace ZIP export ✅
14. `polish` — `Ctrl+Enter` to run, `Ctrl+S` no-op (autosave), responsive layout, README, `.env.example` ✅
15. `resizable-panes` — Drag-to-resize Sidebar (width) and Output (height) panes ✅
    - `SidebarResizer` (col-resize, 5px) + `OutputResizer` (row-resize, 5px)
    - Persisted to `settingsStore` (`sidebarWidth`, `outputHeight`) → localStorage
    - Uses `window`-level `pointermove`/`pointerup` listeners (not `setPointerCapture`) so dragging works smoothly across the Monaco editor surface
    - **Bugfix**: `.app > .main` needed `min-height: 0; overflow: hidden;` — without it, the CSS Grid `1fr` row defaulted to `min-content` sizing and the editor refused to shrink, so the Output pane could shrink but not grow when dragging the divider upward

## Execution Backend History
- **v1 (Piston public)** — `https://emkc.org/api/v2/piston`. Worked initially.
- **v2 (Piston self-hosted)** — switched to `VITE_PISTON_URL` env var after emkc.org became whitelist-only on 2026-02-15. Required user to run Docker locally → friction.
- **v3 (Wandbox)** ✅ current. Free, no API key, CORS `*`, all 11 runnable languages, no setup. Compiler IDs pinned to stable versions. Piston client retained as opt-in for self-hosters.

## Open Considerations
- Wandbox depends on `https://wandbox.org` availability; pinned compiler versions may rotate (client falls back to newest same-family compiler).
- Large workspaces won't fit in URL — share payload capped at ~6 KB with friendly warning; ZIP download handles larger workspaces.
- Monaco bundle is heavy — lazy-loaded from CDN via `@monaco-editor/react` `loader.config`.
- HTML/CSS/JSON/Markdown are editor-only (not executable); `runnable: false` and Run button disabled.

## Status
All 15 todos complete.

---

## Phase 2: Judge0-style multi-pane layout

Inspired by https://ide.judge0.com/. Adds a new right-side column with two stacked panes plus a stdin tab in the existing Output panel.

### Target layout
```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar                                                      │
├────────┬───┬─────────────────────────┬───┬──────────────────┤
│        │   │  TabBar                 │   │ Run Viz (75%)    │
│Sidebar │ R │  Editor                 │ R │                  │
│(files) │ 1 │                         │ 3 ├──── R4 ──────────┤
│        │   ├───── R2 ────────────────┤   │                  │
│        │   │  Output | Input  (tabs) │   │ AI Assist (25%)  │
├────────┴───┴─────────────────────────┴───┴──────────────────┤
│ StatusBar                                                    │
└──────────────────────────────────────────────────────────────┘
R1 = sidebar resizer (existing, col)
R2 = output resizer (existing, row)
R3 = right-pane resizer (NEW, col)
R4 = right-split resizer (NEW, row, between RunViz and AI)
```

### Decisions (confirmed with user)
- **Run Visualization pane** — UI scaffold only. Header + empty visualization area. No input field here (input lives as a tab in the Output panel). Placeholder content: "Visualization will render here." Future: hook into execution result for language-specific visualizations.
- **Input tab in Output panel** — Output panel becomes tabbed: `Output | Input`. The Input tab holds a `<textarea>` whose value is the program's stdin, passed to `execute()` (Wandbox already accepts `stdin`). Persisted per-file in workspaceStore.
- **AI Assistance pane** — Wired to OpenAI via browser fetch, using `VITE_OPENAI_API_KEY` from `.env`. Chat-style UI: scrollable message list + input box + Send. System prompt includes the active file's language and code so the AI has context. README warns the key is exposed client-side (use only for local/personal dev, or proxy through a backend in production).
- **Right column default width** — 360 px, resizable via R3.
- **Right column split** — 75% top (RunViz) / 25% bottom (AI), resizable via R4. Stored as a pixel height for the top pane, computed from ratio on first load.
- **Resizer pattern** — Reuse the working window-listener pattern from `SidebarResizer` / `OutputResizer` (no `setPointerCapture`).
- **Grid restructuring** — `.app` grid columns become `sidebar | R1 | main | R3 | right`. Right column becomes flex-column with `RunViz | R4 | AI`. All grid/flex containers that need to allow children to shrink get `min-height: 0` / `min-width: 0` (lesson learned from the previous Output-grow bug).

### New / changed files
- `src/store/settingsStore.ts` — add `rightPaneWidth` (default 360), `rightTopHeight` (default null → computed as 75% of available on first render).
- `src/store/workspaceStore.ts` — add `stdinByFileId: Record<string, string>` and `setStdin(fileId, value)`. Persist with the rest of the workspace.
- `src/store/aiStore.ts` (NEW) — `messages: {role, content}[]`, `isSending`, `send(prompt, context)`, `clear()`. Persist messages to localStorage (capped to last 50).
- `src/lib/openai.ts` (NEW) — `chat({apiKey, model, messages})` POST to `https://api.openai.com/v1/chat/completions`. Default model `gpt-4o-mini`. Throws on missing key.
- `src/components/RunVizPanel/RunVizPanel.tsx` (NEW) — header "Run Visualization" + empty body placeholder.
- `src/components/AIAssistPanel/AIAssistPanel.tsx` (NEW) — chat list, input, Send, Clear; reads OPENAI key from `import.meta.env.VITE_OPENAI_API_KEY`; shows configuration banner if missing.
- `src/components/OutputPanel/OutputPanel.tsx` — split into tabs `Output | Input`. Input tab is a `<textarea>` bound to `stdinByFileId[activeFileId]`.
- `src/components/RightPaneResizer/RightPaneResizer.tsx` (NEW) — vertical resizer (col-resize); math: `width = window.innerWidth - clientX` (clamped 200-700).
- `src/components/RightSplitResizer/RightSplitResizer.tsx` (NEW) — horizontal resizer inside right column (row-resize); math: `top = clientY - rightColumnTop` (clamped 80-...).
- `src/lib/wandbox.ts` — `execute()` already accepts `stdin`; just pass it through from the Run handler in `App.tsx` and `Toolbar.tsx`.
- `src/App.tsx` — restructure layout to grid with right column; pass stdin to `execute()` in the Ctrl+Enter handler.
- `src/components/Toolbar/Toolbar.tsx` — pass stdin to `execute()`.
- `src/styles/global.css` — new grid template, right column flex, new resizer styles, output tabs, AI chat bubbles. Add `min-height: 0` / `min-width: 0` to all relevant containers.
- `.env.example` — add `VITE_OPENAI_API_KEY=` with comment about exposure.
- `README.md` — document new panes, stdin tab, OpenAI key setup + warning.

### Todos
16. `settings-state` — add `rightPaneWidth`, `rightTopHeight` to settingsStore ✅
17. `stdin-state` — add `stdinByFileId` + `setStdin` to workspaceStore; persist ✅
18. `output-tabs` — Output panel tabbed (Output | Input); Input is a textarea bound to stdin ✅
19. `wire-stdin` — pass `stdin` into `execute()` from App.tsx Ctrl+Enter handler and Toolbar Run button ✅
20. `runviz-panel` — scaffold component (header + placeholder body) ✅
21. `openai-client` — `src/lib/openai.ts` chat() function ✅
22. `ai-store` — `src/store/aiStore.ts` with messages + send + persist ✅
23. `ai-panel` — chat UI, system prompt with active file context, missing-key banner ✅
24. `right-pane-resizer` — vertical drag for right column width ✅
25. `right-split-resizer` — horizontal drag for RunViz/AI split ✅
26. `app-layout` — restructure `.app` grid + `.right` flex column; wire all panes/resizers ✅
27. `styles` — global.css updates (grid template, resizer styles, output tabs, AI bubbles) ✅
28. `env-readme` — `.env.example` + README updates (new panes, stdin tab, OpenAI key + warning) ✅
29. `verify` — `npm run build` clean (284 KB JS / 89 KB gz, 3.87 KB CSS) ✅

## Status (Phase 2)
All 14 Phase 2 todos complete. Build clean. Layout responsive (right column collapses below 1100 px viewport).
Build passes (`tsc -b && vite build` → ~270 KB JS gzipped to ~86 KB). Dev server verified at http://localhost:5173. All 11 runnable languages smoke-tested end-to-end against Wandbox.

---

## Phase 3: UI polish — toolbar, accessibility, fonts

Iterative visual refinements following Phase 2.

### Toolbar sizing (Judge0-style)
- Bumped toolbar to **72 px tall** with **44 px controls** via new `.toolbar-control` class.
- Logo bumped to **22 px**. Run button labeled **"Run Code"** (icon + text).

### Accessibility text-size control
- Reused existing `fontSize` setting (range **10–28**).
- Introduced `--ui-fs` CSS variable on `.app`; converted hard-coded inline `fontSize: 11/12` to `0.85em` / `0.92em` so all UI scales together.
- Added **A− / A+** buttons (Type icons) in toolbar.
- Keyboard shortcuts: **Alt+=** (bigger), **Alt+−** (smaller), **Alt+0** (reset to 14).

### Font selection
- Added `EDITOR_FONTS` and `UI_FONTS` arrays in `settingsStore`.
- Loaded **Inter, JetBrains Mono, Fira Code, Source Code Pro** via Google Fonts in `index.html` (preconnect + stylesheet).
- Added CSS vars `--font-ui-sel` and `--font-mono-sel`; Monaco gets `fontLigatures: true`.
- Initially shipped two dropdowns (UI font + Code font); per user feedback, **dropped the UI-font dropdown** — kept only **Code font** in toolbar (matches VS Code / Judge0 convention). `uiFont` state stays in store for future use.

### UI baseline bump to 16 px
- Changed `--ui-fs` formula from `fontSize − 1` to `Math.max(10, fontSize + 2)`.
- Default editor font 14 → **UI baseline 16 px** (system fonts no longer feel small).

### Pane / dropdown font upsizing
Now that UI baseline is 16 px, bumped pane content sizes to match:

| Area                           | Before    | Now             |
|--------------------------------|-----------|-----------------|
| Files sidebar rows             | ~13 px    | **16 px** + bigger padding & icons (14–16 px) |
| Files header                   | 13 px     | **17 px** (`1.05em`) |
| Output content                 | ~14.7 px  | **16 px** (padding 12) |
| Input textarea                 | ~14.7 px  | **16 px** |
| Run Visualization body         | ~14.7 px  | **16 px** (subtitle 14.4 px) |
| AI Assistance chat list        | ~14.7 px  | **16 px** (gap 8, padding 10) |
| AI message body                | 16 px     | **16.8 px**, line-height 1.5 |
| Output / Input tabs            | ~11.2 px  | **17 px**, padded 8×14 |
| Language dropdown options      | 15 px     | **16 px** |

All sizes are `em`-relative so Alt+= / Alt+− / toolbar A−/A+ continue to scale them.

### Files touched (Phase 3)
- `src/App.tsx` — `--ui-fs` formula, `--font-ui-sel`/`--font-mono-sel` CSS vars, Alt shortcut handler.
- `src/components/Toolbar/Toolbar.tsx` — 72 px toolbar, A−/A+ group, Code font dropdown, "Run Code" label.
- `src/store/settingsStore.ts` — `uiFont`, `editorFont`, `UI_FONTS`, `EDITOR_FONTS`.
- `src/components/EditorPane/EditorPane.tsx` — reads `editorFont`, `fontLigatures: true`, re-layouts on font/size change.
- `src/components/Sidebar/Sidebar.tsx`, `OutputPanel/OutputPanel.tsx`, `RunVizPanel/RunVizPanel.tsx`, `AIAssistPanel/AIAssistPanel.tsx` — `1em` content fonts, larger padding/icons.
- `src/styles/global.css` — `.toolbar-control`, `.text-size-group`, `.bottom-tab` (8×14), `.ai-msg-body` (`1.05em`/1.5), panel-header / select-option font bumps; body uses `var(--ui-fs, 13px)` and `var(--font-ui-sel)`.
- `index.html` — Google Fonts preconnect + stylesheet (Inter, JetBrains Mono, Fira Code, Source Code Pro).

## Status (Phase 3)
All Phase 3 polish tasks complete. Build clean (~284 KB JS / 89 KB gzipped, ~3.9 KB CSS, 0 TS errors).

---

## Phase 4: Azure AI Foundry integration via user token (DefaultAzureCredential)

Replace/augment the OpenAI key-based AI path with **Azure AI Foundry** using the **current user's Azure identity** (no API keys, no app registration on the SPA).

### Decisions (confirmed with user)
- **API surface**: Azure OpenAI on Foundry — **Responses API**
  `https://defaultfoundryresource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview`
- **Deployment / model**: `gpt-5.3-codex`
- **Auth**: `DefaultAzureCredential` from `@azure/identity` — chains env vars → Managed Identity → Azure CLI (`az login`) → VS Code → Azure PowerShell. **No `clientId`** registered on the SPA.
- **Tenant**: `common`
- **Sign-in flow**: popup-style UX in the IDE, but the actual token acquisition happens server-side in a dev-time broker (since `DefaultAzureCredential` cannot run in a browser). Sign-in UI shown in **both** the toolbar and the AI panel header.
- **OpenAI fallback**: kept. Provider precedence is `foundry` (when broker reachable + user signed in) → `openai` (when `VITE_OPENAI_API_KEY` set) → disabled banner.

### Architectural challenge & solution
**Problem**: `DefaultAzureCredential` is a Node-only library. The IDE is a pure SPA. We were told no `clientId` (so MSAL.js is off the table).

**Solution**: Add a tiny **Vite dev-server middleware** that runs in the same Node process as `vite dev` and exposes two endpoints to the SPA on `localhost:5173`:

- `GET /auth/me` → returns `{ signedIn: boolean, upn?: string, tenantId?: string, expiresOn?: number }` — derived from token claims (decoded server-side).
- `GET /auth/token` → returns `{ token: string, expiresOnTimestamp: number }`. Internally calls `new DefaultAzureCredential().getToken("https://cognitiveservices.azure.com/.default")`. **Token never persisted to disk; only held in process memory and surfaced to the same-origin SPA.**
- `POST /auth/signout` → clears in-process token cache (the user's underlying `az login` session is untouched).

For **production** deployments a real backend with proper auth is required; the dev broker is documented as `dev-only`. README will spell this out clearly.

### Target request flow
```
AI Panel  ──send()──►  aiStore  ──►  provider router
                                       │
                            ┌──────────┴──────────┐
                            ▼                     ▼
                       foundry.ts            openai.ts (fallback)
                            │                     │
                  GET /auth/token (cached)        │
                            │                     │
                            ▼                     ▼
              POST .../openai/responses?...   POST api.openai.com/...
                  Authorization: Bearer       Authorization: Bearer
                  <user AAD token>            <VITE_OPENAI_API_KEY>
```

### Responses API translation
The Responses API differs from Chat Completions:
- Request body uses `input` (array of input items) + `model` instead of `messages`.
- System prompt is supplied via `instructions` field.
- Response shape: `output[].content[].text` rather than `choices[0].message.content`.
- Streaming is via SSE on `?stream=true` (deferred — initial cut is non-streaming).

`foundry.ts` will translate our existing `ChatMessage[]` shape into the Responses API request and extract the assistant text from the response.

### New / changed files
- **`server/auth-broker.ts`** (NEW) — Vite middleware module. Exports a function `createAuthBrokerPlugin(): Plugin` that registers Connect-style middleware for `/auth/*`. Uses `@azure/identity`'s `DefaultAzureCredential`, caches the `AccessToken`, refreshes ~5 min before expiry. Decodes JWT to surface `upn`/`name`/`tid` for the `/auth/me` endpoint.
- **`vite.config.ts`** — wire in `createAuthBrokerPlugin()`. Optional env switch `VITE_DISABLE_FOUNDRY=1` to skip loading it (e.g., on machines without `az login`).
- **`src/lib/foundry.ts`** (NEW) — `chat({ messages, instructions, signal })` calls the configured Foundry endpoint. Reads endpoint + deployment from `VITE_FOUNDRY_ENDPOINT` and `VITE_FOUNDRY_DEPLOYMENT` (defaults baked in). Translates messages → Responses API input shape; extracts assistant text. Internal `getToken()` fetches from `/auth/token` and caches in module scope until `expiresOnTimestamp - 60_000`.
- **`src/lib/auth.ts`** (NEW) — thin wrapper around `/auth/me`, `/auth/token`, `/auth/signout`. Exports `useAuth` Zustand store: `{ signedIn, upn, tenantId, isChecking, refresh(), signOut() }`. Polls `/auth/me` on mount and after every send.
- **`src/store/aiStore.ts`** — add provider selection: derives `provider: 'foundry' | 'openai' | 'none'` from `useAuth.signedIn` + `getApiKey()`. `send()` dispatches to the right client. Surface `provider` in state for UI display.
- **`src/components/AIAssistPanel/AIAssistPanel.tsx`** — header shows current provider + signed-in UPN; if `provider === 'none'` show a banner with two CTAs: "Sign in to Azure" (calls `signIn()` → opens popup with instructions to run `az login` if no creds detected, then refreshes `/auth/me`) and "Or set VITE_OPENAI_API_KEY".
- **`src/components/Toolbar/Toolbar.tsx`** — adds an account chip on the right (avatar circle + UPN initials + caret). Click opens a small menu: signed-in identity, "Sign out", "Refresh".
- **`src/components/AuthChip/AuthChip.tsx`** (NEW) — reusable account chip for both toolbar and AI panel header.
- **`package.json`** — add `@azure/identity` (devDependency only; bundled into the broker, not the SPA).
- **`.env.example`** — add `VITE_FOUNDRY_ENDPOINT=...`, `VITE_FOUNDRY_DEPLOYMENT=gpt-5.3-codex`, `VITE_FOUNDRY_API_VERSION=2025-04-01-preview`. Keep `VITE_OPENAI_API_KEY` (optional fallback).
- **`README.md`** — new "Azure AI Foundry sign-in" section: prereqs (`az login` or any DefaultAzureCredential source), how the broker works, security warning (dev-only broker, do not deploy), how to switch to fallback.

### Sign-in UX details
- **First load**: SPA hits `/auth/me`. If the broker can mint a token (e.g., user already `az login`'d), `signedIn=true` and the panel shows the UPN.
- **"Sign in" click**: SPA calls `/auth/me` again; if still not signed in, shows a modal with copy-pastable `az login --tenant common` command + a "Retry" button. (The broker can't *initiate* `az login` in a popup — DefaultAzureCredential just consumes existing creds.)
- **"Sign out"**: `POST /auth/signout` clears the broker's in-memory cache. We tell the user to also `az logout` if they want to fully drop creds.
- **Account chip** appears in both locations per user choice; both bind to the same `useAuth` store so they stay in sync.

### Security notes
- The broker is **dev-only**. It is gated to `localhost`/`127.0.0.1` requests in middleware (rejects all others with 403) to prevent another machine on the LAN from harvesting the bearer.
- Tokens never written to disk. CORS not enabled (same-origin only).
- README documents that for any non-dev environment, the SPA should call a real backend that holds the credential server-side and proxies Foundry calls (not exposing raw bearers to the browser at all).

### Verification
- `npm run dev` → broker logs `[auth-broker] DefaultAzureCredential ready (account: <upn>)` on startup.
- AI panel shows the UPN; sending a prompt hits Foundry, response renders.
- `unset` Azure creds (`az logout`) → AI panel switches to "Sign in" prompt; if `VITE_OPENAI_API_KEY` set, it falls back automatically.
- `npm run build` clean (broker is dev-only, not in production bundle).
- README walkthrough verified by following it from a fresh shell.

### Todos (Phase 4)
30. `dep-azure-identity` — add `@azure/identity` (devDep)
31. `auth-broker` — implement `server/auth-broker.ts` Vite plugin (`/auth/me`, `/auth/token`, `/auth/signout`, localhost gate, JWT claim decode, in-memory cache w/ refresh)
32. `vite-wire-broker` — register plugin in `vite.config.ts`; respect `VITE_DISABLE_FOUNDRY`
33. `foundry-client` — `src/lib/foundry.ts` with Responses API translation + token caching
34. `auth-store` — `src/lib/auth.ts` Zustand store; `/auth/me` polling
35. `ai-provider-router` — extend `aiStore` to dispatch foundry vs openai vs none; expose `provider`
36. `auth-chip` — `AuthChip` component with account display + menu (sign in / sign out / refresh)
37. `panel-integration` — add chip to `Toolbar` and `AIAssistPanel` headers; show provider status + missing-creds banner with CTAs
38. `env-readme-foundry` — `.env.example` updates + README "Azure AI Foundry sign-in" section incl. dev-only security warning
39. `verify-foundry` — `npm run dev`, end-to-end happy path with `az login`'d account; fallback path with `az logout` + key set; `npm run build` clean

### Status (Phase 4)
**All 10 Phase 4 todos complete.** Verified end-to-end:
- `npm run build` clean (~296 KB JS / 93 KB gzipped).
- `[auth-broker] ready (account: <upn>)` on `npm run dev` startup.
- `/auth/me` returns `signedIn:true` with UPN, name, tenant.
- `POST /foundry` proxy returns HTTP 200 with `gpt-5.3-codex` response. Browser uses same-origin call so CORS is not an issue and the bearer never leaves the Node broker.
- OpenAI fallback path retained; chip + banner UX works in both Toolbar and AI panel.

### CORS fix (post-verify)
Initial implementation had the SPA fetch the bearer from `/auth/token` and call the Foundry endpoint directly. That works from `curl` but **fails in the browser with `Failed to fetch`** because Foundry doesn't send `Access-Control-Allow-Origin` for `http://localhost:5173`. Resolved by adding a `POST /foundry` proxy to the broker: the browser only ever calls same-origin localhost, the broker forwards the request server-side using the cached bearer, and the token never crosses into browser memory. `src/lib/foundry.ts` updated to call `/foundry` instead of Azure directly. `clearTokenCache()` retained as a no-op for compat.

### Open questions / parking lot (not blocking)
- Streaming responses (Responses API `?stream=true`) — defer to a later phase.
- Real production backend (replace dev broker) — out of scope here; called out in README.
- Azure AD B2C / personal account scenarios — using `tenantId=common` should cover most; if a user has only personal MSA accounts the cognitive-services scope may not consent (documented as a limitation).

---

## Phase 5: Litecode-style coding agent harness

Turn the IDE into an actual **agentic coding harness** — not just a chat sidecar — modeled on
[razvanneculai/litecode](https://github.com/razvanneculai/litecode). The user describes a change in
plain English; the agent plans which files to touch, executes per-file edits in parallel, and
presents a diff for the user to **Apply** or **Reject**. Multi-file edits, short-term memory, and
strict token budgeting all carry over from litecode — adapted to our in-browser "filesystem"
(the existing `workspaceStore`) and our existing Foundry / OpenAI providers.

### Decisions (confirmed with user)
- **UI placement** — new **"Agent" tab** inside the existing AI Assistance panel, alongside the
  current "Chat" tab. Chat behavior is preserved unchanged.
- **Providers** — reuse Phase 4 stack: Azure AI Foundry (preferred) → OpenAI (fallback). No new
  providers (Ollama/Groq/etc. deferred). The provider router from `aiStore` is reused for both
  planner and executor calls.
- **Context strategy** — **Hybrid**: full file list + per-file metadata is always sent; per-file
  line-range "analysis index" is generated only for files over ~150 lines and used to load just
  the relevant section for the executor. Litecode's three-layer markdown context map system
  (`project_context.md` / `folder_context.md` / `*.file_analysis.md`) is borrowed — but stored
  in-memory in a new `agentContextStore` (not on disk; there is no disk in the browser).
- **Token budget** — **8192 tokens per LLM call**, enforced in code before every call (system
  prompt ~1000 + reserved response ~2000 + memory ~360 → ~4800 for code). Folder context drops
  first, then memory, then code is loaded by section index — matching litecode priority.
- **Approval mode** — **always require diff preview**. Every proposed write goes through a
  `DiffPreviewModal` with per-file Accept / Reject + an Apply All / Reject All footer. Nothing
  touches `workspaceStore` until the user confirms.
- **Memory** — short-term ring buffer of the **last 4 actions** (matches litecode v1.1).
  Persisted to localStorage under a new `agentMemoryStore`. Injected into both planner and
  executor system prompts when budget allows.
- **Parallel execution** — independent file edits run **in parallel** (true `Promise.all`), with
  a topological pre-pass for declared dependencies. (No local-model degenerate case since we
  only support Foundry/OpenAI.)
- **Real "filesystem" semantics retained** — multi-file create / rename / delete / edit, applied
  atomically through `workspaceStore` mutators. A new file proposed by the agent goes through
  `createFile`; renames through `renameFile`; deletes through `deleteFile`; edits through
  `updateContent`. Nothing bypasses the store, so autosave / tabs / Monaco re-tokenization all
  keep working.

### Architecture
```
AI Assistance panel
├─ Chat tab        (existing — unchanged)
└─ Agent tab       (NEW)
   │
   │  user prompt: "rename validateToken to verifyToken everywhere"
   ▼
┌─────────────────────────────────────────────────────────┐
│  PLANNER  (1 LLM call, capped at 8192 tokens)           │
│  Inputs:  project_context + folder_context + memory      │
│  Output:  { synthesis, tasks[ {file, op, deps, hint} ] } │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR  (pure TS, no LLM)                         │
│  - Topo-sort tasks by deps                               │
│  - Group independent tasks into parallel waves           │
│  - For each task: fetch file content (or section via     │
│    file_analysis index if > budget), build executor      │
│    prompt, run canFit() budget check                     │
└─────────────────────────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼     ← parallel wave (Promise.all)
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ EXECUTOR │ │ EXECUTOR │ │ EXECUTOR │  one LLM call per file
   │  auth.js │ │ login.js │ │ utils.js │
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │            │
        ▼            ▼            ▼
        Proposed edits → DiffEngine → DiffPreviewModal
                                            │
                              user clicks Apply / Apply All
                                            │
                                            ▼
                              workspaceStore mutators (atomic)
                                            │
                                            ▼
                              agentMemoryStore.push({synthesis, files, ts})
```

### New files
- `src/agent/types.ts` — `PlannerOutput`, `Task`, `ExecutorEdit`, `FileOp` (`edit|create|rename|delete`), `DiffHunk`, `MemoryEntry`.
- `src/agent/tokens.ts` — minimal token estimator (char/4 heuristic with code-aware bias matching litecode's `countTokens`); `canFit(budget, sections)` helper.
- `src/agent/contextMap.ts` — **borrowed from litecode**. Builds `project_context.md` (tech stack inferred from file extensions + `package.json`), `folder_context.md` per folder (one-line per file), and `*.file_analysis.md` line-range index for any file over 150 lines. All produced as in-memory strings, cached in `agentContextStore`, invalidated on workspace change.
- `src/agent/planner.ts` — builds planner prompt (system + project_context + folder_contexts + memory + user request), enforces budget, calls provider router, parses JSON `{synthesis, tasks[]}` with schema validation + retry-on-malformed.
- `src/agent/orchestrator.ts` — topo-sort, wave grouping, per-task budget check, parallel `Promise.all` per wave, collects `ExecutorEdit[]`.
- `src/agent/executor.ts` — per-task executor: loads file content (or section via analysis index), builds executor prompt with memory if it fits, calls provider, returns proposed new content.
- `src/agent/diff.ts` — line-based diff (Myers, ~80 LOC) producing `DiffHunk[]` for the modal; also handles `create` / `delete` / `rename` ops with synthetic full-file hunks.
- `src/agent/memory.ts` — pure helpers: `synthesize()`, `format()` for prompt injection, ring-buffer push.
- `src/store/agentStore.ts` — Zustand: `{status: idle|planning|executing|previewing|applying|error, currentRun, logs[], pendingEdits[], rejectedIds[]}`. Drives the Agent tab UI.
- `src/store/agentMemoryStore.ts` — Zustand + persist: ring buffer of last 4 `MemoryEntry` objects. Storage key `web-ide.agent.memory.v1`.
- `src/store/agentContextStore.ts` — in-memory cache of context-map strings, keyed by workspace hash; invalidated on `workspaceStore` change.
- `src/components/AIAssistPanel/AgentTab.tsx` — input box, "Run Agent" button, live timeline (planner → orchestrator → per-file spinners), synthesis line, memory chip, token-usage bar.
- `src/components/AIAssistPanel/AIAssistPanel.tsx` — restructured into a tabbed panel `Chat | Agent`. Existing chat moved into `ChatTab.tsx` (no behavior change); shared header (provider chip, AuthChip) stays at top.
- `src/components/DiffPreviewModal/DiffPreviewModal.tsx` — modal with per-file diff (red/green hunks), per-file Accept/Reject toggles, footer Apply Selected / Apply All / Reject All.

### Changed files
- `src/store/workspaceStore.ts` — add `applyAgentEdits(edits: ExecutorEdit[])` mutator that atomically applies a batch (create/rename/delete/edit) inside a single `set()` so tabs/UI update once.
- `src/store/aiStore.ts` — extract `callProvider({instructions, messages, signal})` so planner/executor can reuse the same Foundry/OpenAI router (no duplication of bearer/proxy handling).
- `src/styles/global.css` — Agent tab styles, timeline/spinner, diff hunk colors (`+` / `-` lines reusing `--accent` / `--danger`), modal overlay.
- `README.md` — new "Coding agent" section: how to invoke, the planner/executor model, memory, diff preview, token budget, security note (agent uses same provider auth as Chat).
- `package.json` — no new runtime deps. (Diff is hand-rolled to avoid pulling `diff`/`jsdiff` ~30 KB.)

### Token budget enforcement
Same gating as litecode, in `tokens.ts::canFit`:
```
total          = 8192
system prompt  ≈ 1000  (planner ~1300, executor ~900)
reserved reply = 2000
memory         ≤  360  (4 entries × ~85 tokens) — dropped first if over
folder context ≤ 1500  — dropped second if over
project ctx    ≈  400  — kept unless catastrophic
remaining      → code (full file, else section by analysis index)
```
Every call goes through `canFit()` before dispatch; failures degrade gracefully (drop folder ctx → drop memory → swap full-file for section). The check is never skipped.

### Memory format (matches litecode's `.litecode/memory.json`)
```ts
type MemoryEntry = {
  request: string;       // original user prompt
  synthesis: string;     // planner's one-sentence summary
  files: string[];       // paths actually written
  timestamp: number;
};
```
Ring buffer of 4. Oldest evicted on push. Persisted to localStorage so it survives reloads.
A new entry is pushed **only after at least one edit is successfully applied** (matches
litecode's "successful apply" trigger).

### Diff preview UX
- Modal opens automatically when executor wave completes and at least one edit is proposed.
- Per-file panel: file path + op badge (`edit` / `create` / `rename` / `delete`), then a
  monospace diff with red/green line gutters. Long files collapsible.
- Per-file checkbox (default checked); footer shows `Apply N selected` + `Apply All` + `Reject All` + `Cancel`.
- `Apply` calls `workspaceStore.applyAgentEdits()` with only the accepted edits, then pushes a
  `MemoryEntry` reflecting what was actually written.
- `Reject` discards the proposed edits; nothing is written; no memory entry pushed.

### Parallel execution policy
- Orchestrator computes parallel **waves** via topological sort on `task.deps`.
- Within a wave, all executor calls fire under `Promise.all` (true parallel HTTP).
- Between waves, the next wave waits for the previous to fully resolve (so dependent files see
  the latest content).
- Cap concurrency at **6** per wave to avoid hitting Foundry rate limits; configurable via
  `VITE_AGENT_MAX_CONCURRENCY`.

### Failure handling
- Malformed planner JSON → one automatic retry with a "respond ONLY with valid JSON" reminder
  appended; second failure surfaces a structured error in the Agent timeline.
- Per-file executor failure → that file is marked `failed` in the diff modal, other files still
  preview normally; user can still Apply the successful ones.
- Provider auth failure (Foundry token expired / OpenAI key missing) → falls back through the
  same provider router as Chat; surfaces the same "Sign in / set key" banner already used.

### Verification
- **Unit-ish**: test `tokens.canFit()` priority drops, `diff` against fixtures, `memory` ring buffer eviction, `contextMap` generation against a synthetic workspace.
- **End-to-end smoke**: a 3-file workspace + prompt "rename foo to bar everywhere" → planner returns 3 tasks → 3 parallel executors → modal shows 3 diffs → Apply All → workspace mutates → memory entry pushed → second prompt "undo the last change" sees memory and reverts.
- **Budget gate**: synthesize a workspace with one >5000-token file; verify executor falls back to section loading via file_analysis index.
- **Cancel**: clicking Cancel mid-run aborts in-flight `fetch`es via `AbortController` chain.
- `npm run build` clean (no new runtime deps; bundle delta ≤ +15 KB gzipped).

### Todos (Phase 5)
40. `agent-types`             — `src/agent/types.ts` (PlannerOutput, Task, ExecutorEdit, FileOp, DiffHunk, MemoryEntry)
41. `tokens-budget`           — `src/agent/tokens.ts` token estimator + `canFit()` priority logic
42. `context-map`             — `src/agent/contextMap.ts` borrowed from litecode (project / folder / file_analysis), in-memory cache
43. `agent-context-store`     — `src/store/agentContextStore.ts` cache + invalidation hook on workspaceStore change
44. `provider-router-extract` — extract `callProvider()` from `aiStore` so planner/executor reuse Foundry/OpenAI dispatch
45. `planner`                 — `src/agent/planner.ts` prompt build + JSON parse + retry-on-malformed
46. `executor`                — `src/agent/executor.ts` per-task LLM call w/ memory + section loading
47. `orchestrator`            — `src/agent/orchestrator.ts` topo-sort + wave grouping + bounded `Promise.all`
48. `diff-engine`             — `src/agent/diff.ts` Myers diff + create/delete/rename hunks
49. `memory-store`            — `src/store/agentMemoryStore.ts` ring buffer of 4 + persist
50. `memory-helpers`          — `src/agent/memory.ts` synthesize/format/push helpers
51. `agent-store`             — `src/store/agentStore.ts` status machine + timeline log + pendingEdits
52. `apply-edits-mutator`     — `workspaceStore.applyAgentEdits()` atomic batch (create/rename/delete/edit)
53. `agent-tab-ui`            — `AgentTab.tsx` (input, run button, timeline, spinners, memory chip, token bar)
54. `panel-tabs`              — refactor `AIAssistPanel` into `Chat | Agent` tabs; extract `ChatTab.tsx` (no behavior change)
55. `diff-preview-modal`      — `DiffPreviewModal.tsx` per-file diff + per-file accept + Apply/Reject footer
56. `styles-agent`            — `global.css` agent timeline, diff hunks, modal overlay
57. `abort-control`           — wire `AbortController` chain through planner/executor/orchestrator + Cancel button
58. `env-readme-agent`        — `.env.example` (`VITE_AGENT_MAX_CONCURRENCY`) + README "Coding agent" section
59. `verify-agent`            — end-to-end smoke (3-file rename, undo via memory, big-file section fallback, cancel mid-run); `npm run build` clean

---

## Phase 6 — Code execution visualization (Run Viz pane)

**Goal**: turn the placeholder **Run Visualization** pane on the right into a real, animated
algorithm visualizer. The user clicks a **Visualize** button, the IDE detects what their code
does (BFS on a graph, quicksort on an array, DFS on a tree, A* on a grid, etc.), generates a
sample input, runs the user's code with embedded probes, and animates the algorithm step-by-step.

### Design decisions (locked with user)
- **Animated step trace** with play / pause / step-forward / step-back / speed / reset.
- **AI-detect with manual override**: detection is automatic, but the user can override the
  category from a dropdown (Auto-detect / Graph / Tree / Array sort / Grid / Linked list /
  Recursion call tree / Stack-Queue). Forcing a category triggers a re-plan.
- **Trigger**: a separate **Visualize** button in the Run Viz pane (independent of Run/Ctrl+Enter).
- **Trace source**: real instrumentation first — the planner LLM rewrites the user's source with
  inline probes that print `__VIZ__:{json}` lines. Wandbox runs the rewritten source. The runner
  parses those lines into a typed event stream. **LLM-simulated trace as fallback** when
  instrumentation fails (Wandbox non-zero AND no `__VIZ__:` lines, parser yields zero events,
  or instrumented source exceeds budget). UI surfaces a "Simulated" badge in fallback mode.
- **Renderers**: hand-rolled SVG for all 7 categories — zero new runtime deps.

### Categories & step-op vocabularies (v1)

| Category               | Sample input shape                         | Step ops |
|------------------------|--------------------------------------------|----------|
| `graph`                | nodes[], edges[], directed?                | visit, enqueue, dequeue, push, pop, set_state, highlight_edge, set_distance |
| `tree`                 | rooted nodes[]                             | enter, leave, visit, highlight_edge, set_value |
| `array_sort`           | int[]                                      | compare(i,j), swap(i,j), set(i,v), mark_sorted(i), highlight_range(lo,hi) |
| `grid`                 | rows×cols, start, goal, walls              | visit(r,c), set_state, set_value, highlight_path |
| `linked_list`          | head + nodes                               | visit, set_pointer(name,node), set_next, insert, delete |
| `recursion_call_tree`  | implicit                                   | call(id,fn,args), return(id,value), highlight |
| `stack_queue`          | empty                                      | push, pop, enqueue, dequeue, peek |

### Architecture
```
RunVizPanel ──► vizStore ──► orchestrator ──► planner (LLM)
                                            │       └─ {category, sampleInput, instrumentedCode, stdin?}
                                            ├──► runner (wandbox) ─ parse __VIZ__:{json} ─► trace
                                            └──► simulator (LLM)  ──── fallback ─────────► trace
                                                  │
                                                  ▼
                                          animator (pure reducer + clock)
                                                  │
                                                  ▼
                                          renderers/<category>.tsx (SVG)
```
- `applyEvent(state, event)` is pure per-category. `stateAt(events, step)` recomputes from
  event 0 to N each render — cheap at ≤500 events; no incremental delta tracking needed.
- Playback clock is a `setInterval` driven by speed (steps/sec); pause/resume/step controls toggle it.
- **AbortController** chain: Cancel aborts planner / runner / simulator fetches mid-flight,
  matching the Phase 5 agent pattern.

### Files to create
- `src/viz/types.ts` — `VizCategory`, `VizPlan`, discriminated `VizEvent` per category, `VizTrace`, `VizStatus`.
- `src/viz/prompts.ts` — system-prompt builder documenting JSON contract + per-category vocab + `__VIZ__:` protocol + caps.
- `src/viz/planner.ts` — `callProvider()` wrap, parse/validate JSON, one retry on malformed, propagate `forceCategory` hint.
- `src/viz/runner.ts` — `wandbox.execute()` on `plan.instrumentedCode`, line-scan stdout for `__VIZ__:` prefix, JSON.parse, cap at `VITE_VIZ_MAX_STEPS`, return `{events, cleanStdout, exitCode, ranOk, truncated}`.
- `src/viz/simulator.ts` — fallback `callProvider()` asking for `VizTrace` JSON directly given category + sampleInput + original source. Validate. Mark `fallback=true`.
- `src/viz/orchestrator.ts` — plan → run → fallback. Returns `{plan, trace, simulated, cleanStdout?}`. Single AbortSignal threaded through.
- `src/viz/animator.ts` — per-category `applyEvent` reducers, `stateAt(events, step)`, playback clock.
- `src/viz/renderers/Graph.tsx` — circular layout (small graphs) or BFS-leveled, nodes (circles + labels), edges (lines, arrowheads if directed), state colors (idle / frontier / visiting / visited / done), distance labels.
- `src/viz/renderers/Tree.tsx` — width-by-subtree hierarchical layout, parent–child edges, current-visit highlight, traversal edge highlight.
- `src/viz/renderers/ArraySort.tsx` — bar chart proportional to value + value labels, compare/swap highlighting (cyan/orange), sorted region (green), pivot/range markers.
- `src/viz/renderers/Grid.tsx` — rows×cols cells, walls dark, start/goal markers, visited shading, frontier color, optional final path overlay polyline.
- `src/viz/renderers/LinkedList.tsx` — horizontal node boxes with arrow links; named pointers (head, slow, fast, prev, curr) shown above nodes.
- `src/viz/renderers/RecursionTree.tsx` — depth-first growing call tree labeled `fn(args)=>value`, current call highlighted, returns annotate the node.
- `src/viz/renderers/StackQueue.tsx` — stack as vertical box stack, queue as horizontal box row; push/pop/enqueue/dequeue with brief end-highlight.
- `src/viz/renderers/index.ts` — dispatcher: pick renderer by `plan.category`; pass `{plan, state}`.
- `src/store/vizStore.ts` — Zustand state machine: `idle | planning | running | simulating | ready | playing | paused | error | cancelled`. State: `plan`, `trace`, `currentStep`, `speed`, `forceCategory`, `simulated`, `error`, `abort`. Actions: `startVisualize / cancel / play / pause / step / seek / setSpeed / setForceCategory / reset`.

### Files to modify
- `src/components/RunVizPanel/RunVizPanel.tsx` — full rewrite: header has **Visualize** / Cancel, Auto-detect/category override dropdown, transport (▶ / ⏸ / ⏮ / ⏭ / Reset), speed selector, Simulated badge, status, truncation warning, error display. Body mounts dispatched renderer or empty state.
- `src/styles/global.css` — `.viz-controls`, `.viz-svg`, theme-aware fills/strokes per node-state class, `.viz-badge`, `.viz-warning`.
- `.env.example` — `VITE_VIZ_MAX_STEPS=500` (commented).
- `README.md` — "Run visualization" section: categories, button, fallback semantics.

### Key constraints
- **No new runtime deps** — all renderers hand-rolled SVG.
- **Bundle delta ≤ +20 KB gz** (current baseline 102 KB gz; target ≤ 122 KB gz).
- Hard event cap (`VITE_VIZ_MAX_STEPS`, default 500) to prevent runaway traces; UI shows truncated notice.
- All renderers light/dark theme aware via existing CSS vars.
- `AbortController` chain so Cancel works mid-plan, mid-run, and mid-simulate.

### Failure handling
- Malformed planner JSON → one automatic retry with "respond ONLY with valid JSON" reminder.
- Instrumented code fails to compile / runs but emits no `__VIZ__:` lines → fallback to simulator; UI shows "Simulated" badge.
- Simulator also fails → surface structured error in panel; Run button stays available.
- Trace > `VITE_VIZ_MAX_STEPS` → truncate with notice; playback still works on the truncated tail.

### Verification
- **Build**: `npm run build` clean; bundle delta within +20 KB gz.
- **End-to-end smoke** (Playwright):
  1. Load a Python BFS sample → click **Visualize** → graph renders → press **Play** → nodes color in BFS visit order.
  2. Override to **Tree** on a tree-DFS code path → re-plan triggers, tree renderer mounts.
  3. Force a deliberately broken instrumented run → confirm fallback to simulator → "Simulated" badge appears → trace still plays.
  4. Cancel mid-plan → status transitions to `cancelled`, no orphan timers, no stuck spinners.

### Todos (Phase 6)
60. `viz-types`                 — `src/viz/types.ts` core types (VizCategory, VizPlan, VizEvent, VizTrace, VizStatus)
61. `viz-prompts`               — `src/viz/prompts.ts` per-category vocab + JSON contract + `__VIZ__:` protocol
62. `viz-planner`               — `src/viz/planner.ts` LLM call → VizPlan, retry on malformed, propagates forceCategory
63. `viz-runner`                — `src/viz/runner.ts` wandbox run + `__VIZ__:` parser + step cap
64. `viz-simulator`             — `src/viz/simulator.ts` LLM trace fallback when runner yields nothing
65. `viz-orchestrator`          — `src/viz/orchestrator.ts` plan → run → fallback pipeline w/ AbortSignal
66. `viz-store`                 — `src/store/vizStore.ts` state machine + transport controls + abort
67. `viz-animator`              — `src/viz/animator.ts` per-category applyEvent + stateAt + playback clock
68. `viz-renderer-graph`        — `Graph.tsx` SVG renderer
69. `viz-renderer-tree`         — `Tree.tsx` SVG renderer
70. `viz-renderer-array`        — `ArraySort.tsx` SVG renderer
71. `viz-renderer-grid`         — `Grid.tsx` SVG renderer
72. `viz-renderer-linked-list`  — `LinkedList.tsx` SVG renderer
73. `viz-renderer-recursion`    — `RecursionTree.tsx` SVG renderer
74. `viz-renderer-stackqueue`   — `StackQueue.tsx` SVG renderer
75. `viz-renderer-dispatcher`   — `renderers/index.ts` category → renderer
76. `viz-panel-ui`              — `RunVizPanel.tsx` rewrite (Visualize/Cancel, override dropdown, transport, badges)
77. `viz-styles`                — `global.css` viz controls + SVG state-class theme tokens
78. `viz-env-readme`            — `.env.example` (`VITE_VIZ_MAX_STEPS`) + README "Run visualization" section
79. `viz-verify`                — Playwright smoke (BFS render+play, override re-plan, fallback badge, cancel)

---

## Phase 7 — Cursor ↔ Visualization binding

The Run Visualization currently feels detached from the source code: the
trace plays via a timer with no visible link to the editor. Phase 7 wires
the editor cursor and the visualization step **bidirectionally** so that
moving the cursor in the editor seeks the viz, and stepping the viz scrolls
+ highlights the executing line in the editor.

### User-decided behaviour
- **Bidirectional binding**, always synced (when "Follow code" is on)
- **Cursor on a line with no event** → show state after last event with
  `event.line ≤ cursor.line` (last_le mapping; feels continuous)
- **Auto-reveal**: yes — `revealLineInCenterIfOutsideViewport`
- **After file edit**: keep mapping, show "Code modified — re-Visualize"
  yellow banner (mapping is stale but better than nothing)
- **"Follow code" toggle** in the viz toolbar (default ON)

### Source-line tagging in probes
Every `__VIZ__:{json}` probe gains an optional `"line": <int>` field — the
1-based line number in the user's **ORIGINAL** source the event
corresponds to (NOT the line in the rewritten instrumented code). The
planner already controls the JSON; the prompt just needs to require this
field. The simulator gets the same instruction. Backward-compat: events
without `line` still play; cursor binding silently no-ops.

### Two precomputed indexes (in vizStore)
On every `setTrace` / `startVisualize` completion:
- `stepToLine[step] → line | undefined` — direct from `events[step-1].line`
- `_lineIndex: [line, step][]` (sorted by line) → used by
  `stepFromLine(line) → step` via binary search returning the **last**
  step whose event line ≤ given line

### Bidirectional binding effect (in EditorPane)
Active when `followCode && plan && trace && activeFileId === vizFileId`:

**Viz → editor** (driven by `currentStep` change):
- `target = lineForStep(currentStep)`
- If `target !== current cursor line`, programmatically `setPosition`
- `revealLineInCenterIfOutsideViewport(target)`
- Apply Monaco line decoration (`viz-exec-line` + gutter glyph
  `viz-exec-glyph`)

**Editor → viz** (driven by `onDidChangeCursorPosition`):
- If event came from our programmatic update (suppress flag) → ignore
- Else `seek(stepFromLine(cursorLine))`

**Loop guard**: a `programmaticUpdateRef` ref is true around any
`setPosition` we issue, so the cursor-change handler ignores the bounce.

### Stale-source detection
On `startVisualize` completion, capture `vizFileId` and `vizSourceHash`
(djb2 of `file.content`). Subscribe to `model.onDidChangeContent` for
`vizFileId`; recompute hash on change; mismatch sets `staleSource = true`.
Renders a yellow `viz-stale-banner` in the panel:

> ⚠ Code modified since visualize — line mapping may be off. **Re-Visualize**

The Re-Visualize link calls `startVisualize()` and clears the flag.

### File-switch handling
If `activeFileId !== vizFileId`, the binding effect tears down decorations
on the (now-old) editor model; the trace stays in vizStore. Switching the
tab back restores binding.

### UI surface
- **Follow-code toggle** — Link2/Link2Off button between Cancel/Visualize
  and the category dropdown. Active styling when ON. Disabled when no
  trace.
- **Stale banner** — yellow strip below toolbar, only shown when
  `staleSource && !busy`.

### Risks
- Loop oscillation between programmatic setPosition and cursor handler —
  mitigated by `programmaticUpdateRef` flag and microtask reset.
- Cursor outside event-line range (line 1 with first event line 5) —
  index returns step 0 (initial state). Correct.
- Old traces without line tags — index empty → both directions no-op
  silently. Toggle still appears but does nothing.
- Auto-scroll noise during play — `revealLineInCenterIfOutsideViewport`
  only scrolls when off-screen. Acceptable.

### Files touched
- `src/viz/types.ts` — Add `line?: number` to every concrete VizEvent
  variant.
- `src/viz/prompts.ts` — Add LINE TAGS section to planner + simulator
  prompts.
- `src/store/vizStore.ts` — `followCode`, `vizFileId`, `vizSourceHash`,
  `staleSource`, `_lineIndex`, helpers `stepFromLine`, `lineForStep`,
  `setFollowCode`, `markStale`.
- `src/components/EditorPane/EditorPane.tsx` — Bidirectional effect +
  decoration management.
- `src/components/RunVizPanel/RunVizPanel.tsx` — Toggle button + stale
  banner.
- `src/styles/global.css` — `.viz-exec-line`, `.viz-exec-glyph`,
  `.viz-stale-banner` (light + dark).
- `src/lib/hash.ts` (new, ~10 lines) — `djb2(s) → string`.
- `README.md` — "Bidirectional cursor binding" subsection under "Run
  visualization".

### Todos (#80–90)
80. **viz-line-types** — Add `line?:number` to VizEvent + djb2 helper.
81. **viz-line-prompts** — Require line tags in planner + simulator prompts.
82. **viz-line-store** — vizStore: followCode, vizFileId, vizSourceHash, staleSource, indexes, helpers.
83. **viz-line-edit-watch** — Hook `model.onDidChangeContent`; flip staleSource on hash mismatch.
84. **viz-line-editor-binding** — Bidirectional cursor↔step effect in EditorPane.
85. **viz-line-decorations** — Monaco line decoration + gutter glyph.
86. **viz-line-toggle-ui** — Follow-code toggle in viz toolbar.
87. **viz-line-stale-banner** — Yellow banner with Re-Visualize action.
88. **viz-line-styles** — CSS for exec-line, gutter glyph, stale banner.
89. **viz-line-readme** — Document cursor binding in README.
90. **viz-line-verify** — Build clean (≤+20 KB gz); Playwright smoke (cursor moves seek, step moves cursor, edit fires banner, toggle off disables binding, file switch clears decoration).

---

## Phase 7.5 — Visualization toolbar UI refinements (shipped)

A series of small visual cleanups to the Run Visualization pane toolbar after Phase 7 landed, driven by direct UX feedback. No new functionality — purely layout, sizing, and labelling.

### Changes
- **Removed the "Run Visualization" panel title** (<Sparkles/> + <strong>Run Visualization</strong>) from the toolbar to reclaim vertical space; the panel context is already obvious from its position in the right column.
- **Transport buttons (Step back / Play–Pause / Step forward / Restart) made always-visible** (previously gated behind `{hasTrace && (...)}`). They now render unconditionally with disabled={!hasTrace || ...} so the playback controls don't pop into existence after the first visualize — improves discoverability.
- **Split the toolbar into two rows**:
  - Row 1: Run Visualization / Cancel · Follow code toggle · Auto-detect (category override)
  - Row 2 (new `viz-toolbar viz-transport`): Step back · Play / Pause · Step forward · Restart · Speed
  - Both rows share .viz-toolbar so they pick up identical padding, gap, border-bottom, and wrap behavior automatically. The new row carries an extra `viz-transport` modifier class for future per-row tweaks (no rule yet).
- **Renamed `Visualize` → `Run Visualization`** on the primary button (and `Re-Visualize` → `Re-run Visualization` on the stale-banner re-run button + matching tooltip/empty-state hint text).
- **Sized all viz pane buttons and dropdowns to match the toolbar's `Run Code` button** (the `.toolbar-control` 44 px-tall standard):
  - `.viz-btn` and `.viz-select` bumped to `font-size: 15px; padding: 10px 18px; border-radius: 6px; gap: 10px; height: 44px; line-height: 1`.
  - New `.viz-btn-icon` modifier (`width: 44px; padding: 0; gap: 0`) used by the four icon-only transport buttons so they stay perfectly square.
  - All lucide icon sizes inside the viz pane bumped from `size={14}` → `size={20}` to match `Run Code`'s `<Play size={20} />`.
  - The compact stale-banner re-run button keeps its small footprint via inline `height: 'auto'` override.

### Files touched
- `src/components/RunVizPanel/RunVizPanel.tsx` — JSX restructure (title removed, toolbar split into two `.viz-toolbar` rows, transport always-visible-but-disabled, button labels and icon sizes updated, `viz-btn-icon` modifier applied to transport buttons).
- `src/styles/global.css` — `.viz-btn` and `.viz-select` re-sized to mirror `.toolbar-control`; new `.viz-btn-icon` rule.

### Verification
- `npm run build` clean across all four iterations.
- Bundle size held flat: 115.88 → 115.90 → 115.92 → 115.96 KB gz.

---

## Phase 8 — Visualization pane zoom controls (shipped)

The visualizations currently render at the natural canvas size. Busy graphs/grids can be hard to read in detail, and large structures get cramped. Phase 8 adds renderer-agnostic **zoom in / zoom out** controls.

### Approach
CSS-transform `scale(zoom)` wrapper around the existing `<VisualizationRenderer>`. Renderer-agnostic — works for SVG, HTML, and canvas renderers without touching any of the per-category renderer code. The renderer is still given the natural canvas dimensions, so its **layout** is computed at the base resolution; only the visual presentation scales.

### User-decided behaviour
- **Discrete zoom levels**: `[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]`. `+`/`−` snap to the next/previous level.
- **Zoom > 100%** → the canvas wrapper becomes scrollable, content anchored top-left so users can pan around large diagrams.
- **Zoom < 100%** → content centered inside the canvas (no awkward empty top-left + filled bottom-right).
- **`Ctrl + scroll wheel`** over the canvas zooms (preventDefault so it doesn't also browser-zoom the IDE shell).
- **Auto-reset to 100%** when a brand-new plan is generated, so switching from a graph to a grid doesn't carry over an irrelevant zoom level.
- **`viz-note` overlay** (current step's caption) stays **outside** the scaled subtree as UI chrome — it remains crisp and full-width regardless of zoom.

### Files to change
- `src/store/vizStore.ts` — add `zoom: number` (default `1`) and `_zoomLevels` constant. New actions `setZoom(n)`, `zoomIn()`, `zoomOut()`, `resetZoom()` (clamped to `[0.25, 4]`). Reset zoom to `1` inside `startVisualize` after a new plan/trace lands.
- `src/components/RunVizPanel/RunVizPanel.tsx` — add three controls to the transport row (after `Speed`): `ZoomOut` button · clickable `100%` reset label · `ZoomIn` button (all sized identically to other transport buttons; `viz-btn-icon` for the +/− pair). Wrap the renderer mount in a scrollable `.viz-scale-outer` containing a sized inner div and a scaled child (`transform: scale(zoom); transform-origin: 0 0`). Wire `onWheel` on `.viz-scale-outer` that, when `ctrlKey` is held, prevents default and calls `zoomIn`/`zoomOut`.
- `src/styles/global.css` — add `.viz-scale-outer { position:absolute; inset:0; overflow:auto; display:flex; }`. Centering vs `flex-start` switched via inline style based on `zoom <= 1` vs `zoom > 1`.

### Out of scope
- Per-renderer rework (we intentionally don't push zoom into individual renderers — would be invasive and would change layout, not just visual scale).
- Pinch-to-zoom on touch devices.
- "Fit to screen" auto-zoom (would require renderers to expose their natural content bounds, which they currently don't).

### Verification
- `npm run build` clean.
- Manual: visualize a graph → zoom in to 200% → scrollbars appear, panning works → zoom out to 50% → content centered → reset → snaps back to 100% → `Ctrl+scroll` over canvas zooms without browser-zooming.

### Todos (Phase 8)
- `viz-zoom-store`    — `zoom` state + `setZoom` / `zoomIn` / `zoomOut` / `resetZoom` in `vizStore.ts`; reset on new plan ✅
- `viz-zoom-controls` — `−` / `100%` / `+` triple in the transport row of `RunVizPanel.tsx` ✅
- `viz-zoom-render`   — wrap renderer in scaled scrollable subtree; keep `viz-note` outside ✅
- `viz-zoom-wheel`    — `Ctrl+wheel` handler on `.viz-scale-outer` ✅
- `viz-zoom-css`      — `.viz-scale-outer` rule in `global.css` ✅
- `viz-zoom-build`    — `npm run build` verification ✅ (116.55 KB gz, +0.59 KB)

### Outcome
- Shipped as designed. Bundle delta +0.59 KB gz (final 116.55 KB).
- Constants exported from `vizStore.ts` as `VIZ_ZOOM_LEVELS`. Discrete snapping behaved well in practice.
- **Follow-up tweak (shipped):** the zoom triple is **right-justified** within the transport row — the `<span className="spacer" />` was moved to sit **between Speed and ZoomOut**, so transport (`Step back / Play–Pause / Step forward / Restart / Speed`) hugs the left and zoom (`− / 100% / +`) hugs the right. Visual hierarchy: playback controls together on the left, view controls together on the right.

---

## Phase 9 — Reset Code button (shipped)

A toolbar button that returns the active file (and the surrounding stateful panels) to a known-clean starting point with one click.

### User-decided behaviour
- **Position**: in the Run Code row, **right side, immediately in front of the font select dropdown**.
- **Style**: `.toolbar-control` (same 44 px height / padding / font as Run Code) **with the new `.danger` class — filled red**. After initial planning the user requested the red tint so the destructive action is visually distinct from the green Run Code button. Icon `RotateCcw`. Label "Reset Code".
- **Disabled** when no active file.
- **Confirm guard** — `window.confirm('Reset this file to the starter and clear the visualization, chat, and agent state? This cannot be undone.')` — one-click toolbar buttons are easy to misclick and the action is destructive (overwrites code + drops chat history immediately to localStorage).

### What it clears (using existing store actions)
| Concern | Existing API |
|---|---|
| **Code pane** → restore HelloWorld | `useWorkspace.updateContent(file.id, getLanguage(file.language).starterCode)` |
| **Run Visualization pane** | `useViz.resetAll()` (drops plan / trace / error / stale-source state, aborts in-flight orchestration) |
| **AI chat panel** | `useAI.clear()` (empties messages + clears error) |
| **Agent panel** | `useAgent.reset()` (idle status, no current run, empty logs / pendingEdits) |
| **Output panel** (tightly coupled) | `useRun.setResult(null)` + `setError(null)` |
| **Stdin** (tightly coupled) | `useWorkspace.setStdin(file.id, '')` |

Output panel + stdin aren't in the user's literal list, but they're tied to the now-stale code — leaving them populated after a code reset would feel inconsistent. Included as "tightly coupled extras"; trivial to remove if undesired.

### Files to change
- `src/components/Toolbar/Toolbar.tsx` — import `RotateCcw` from `lucide-react`; import `useViz` / `useAI` / `useAgent` (called via `getState()` inside the handler — no need to subscribe). Subscribe to `useWorkspace.updateContent` and `useWorkspace.setStdin`. Add `onResetCode` handler implementing the table above (guarded by `confirm`). Insert the button JSX between the share-notice span and the font select. Disabled if `!file`. Class `"danger toolbar-control"`.
- `src/styles/global.css` — added a generic **`button.danger`** rule mirroring the existing `button.primary`: filled `var(--danger)` background (`#d13438` light / `#f48771` dark) with `#ffffff` text and `brightness(1.1)` on hover. Generic so it can be reused for other destructive toolbar actions later.

### Out of scope
- No changes to other panels — they consume their store state reactively, so clearing the store is enough.
- No undo / restore — the user already has Ctrl+Z in Monaco for the immediate code reset, but cross-store undo is out of scope.
- No keyboard shortcut.

### Verification
- `npm run build` clean.
- Manual: edit code, visualize, send a chat message, run an agent task → click **Reset Code** → confirm → editor shows starter, viz pane shows empty state, chat panel clears, agent panel returns to idle, output panel empties.

### Todos (Phase 9)
- `reset-code-button` — Add Reset Code button in `Toolbar.tsx` with confirm + multi-store reset handler ✅
- `reset-code-build`  — `npm run build` verification ✅ (116.62 KB gz, +0.07 KB)

### Outcome
- Shipped as designed. Bundle delta +0.07 KB gz (final 116.62 KB).
- All four target panels (code, viz, chat, agent) plus the two tightly coupled extras (output, stdin) cleared from a single button click — no per-panel UI changes were required because each store already exposed an idempotent reset/clear primitive.
- **Follow-up tweak (shipped):** added `className="danger"` to the button and a new generic `button.danger` rule in `global.css` (peer to `button.primary`) so the button now reads as a clearly destructive red action — same 44 px size as Run Code, but visually opposite (red vs accent).
