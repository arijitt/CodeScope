# Web IDE

A browser-based IDE built with React + Vite + Monaco Editor. Supports 15 languages with syntax highlighting and remote code execution via the [Piston](https://github.com/engineer-man/piston) public API.

## Features

- 🎨 **Monaco Editor** — VS Code's editor with full syntax highlighting
- 🌐 **15 languages**: JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby, PHP, HTML, CSS, JSON, Markdown, SQL
- ▶️ **Run code** via Wandbox API (no API key required)
- 📥 **Stdin tab** in the Output panel — feed standard input to your program
- 📁 **File tree** with create/rename/delete
- 📑 **Tabs** for multiple open files
- 🪟 **Multi-pane layout** — Files (left) · Editor + Output (center) · Run Visualization + AI Assistance (right)
- ↔️ **Draggable resizers** on every pane (double-click any divider to reset)
- 🤖 **AI Assistance** pane — chat with **Azure AI Foundry** using your own Azure identity (no API key); falls back to OpenAI when a key is provided
- 🌗 **Light / dark themes**
- 💾 **Autosave** to `localStorage`
- ⬇️ **Download** active file or whole workspace as ZIP
- 🔗 **Share via URL** (workspace compressed into the URL)
- ⌨️ **Shortcuts**: `Ctrl+Enter` to run, `Ctrl+S` no-op (autosave)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Build

```bash
npm run build
npm run preview
```

## Code execution backend (Wandbox)

The Run button uses the free public **[Wandbox](https://wandbox.org/)** API — no setup, no API key, CORS-enabled. All 11 runnable languages are supported (HTML/CSS/JSON/Markdown are editor-only).

To use a different Wandbox instance, set `VITE_WANDBOX_URL` in `.env`:

```
VITE_WANDBOX_URL=https://wandbox.org/api
```

A legacy Piston client is still in `src/lib/piston.ts` if you'd rather self-host a Piston server. Note: the public emkc.org Piston API became whitelist-only on 2026-02-15.

## AI Assistance pane

The right-side **AI Assistance** pane has two providers, picked automatically:

| # | Provider | When it's used | What you need |
|---|----------|----------------|---------------|
| 1 | **Azure AI Foundry** *(preferred)* | Whenever you're signed in to Azure on this machine | `az login` (or any [`DefaultAzureCredential`](https://learn.microsoft.com/azure/developer/javascript/sdk/credential-chains#use-defaultazurecredential-for-flexibility) source: VS Code Azure, Managed Identity, `AZURE_*` env vars) |
| 2 | **OpenAI** *(fallback)* | When no Azure credential is available | `VITE_OPENAI_API_KEY` set in `.env` |

The current provider is shown next to the AI panel header along with an **account chip** (also visible in the top toolbar). Click it to refresh credentials, sign out, or read instructions when not signed in.

### Azure AI Foundry sign-in

Foundry is called using **your own** AAD bearer token — no API key, no app registration on the SPA.

1. Sign in once in your terminal:
   ```bash
   az login --tenant common
   ```
2. `npm run dev` — startup logs `[auth-broker] ready (account: <your-upn>)`.
3. Open the IDE; the AI panel header shows your UPN and `Azure Foundry · gpt-5.3-codex`. Type a prompt — it's calling your Foundry endpoint.

Configure the endpoint and deployment in `.env`:
```
VITE_FOUNDRY_ENDPOINT=https://defaultfoundryresource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview
VITE_FOUNDRY_DEPLOYMENT=gpt-5.3-codex
```

#### How it works
`DefaultAzureCredential` is Node-only — it cannot run in a browser. To use it without an SPA app registration / MSAL.js, the Vite dev server runs a tiny **localhost-only auth broker** (`server/auth-broker.ts`) that mints the bearer in the same Node process and serves it to the SPA at `/auth/token`. Tokens are kept in process memory only and never written to disk. The broker rejects any request not coming from `127.0.0.1` / `::1`.

> 🛑 **Production warning** — this dev broker is for local development only. Any process on your machine that can reach `localhost:5173` can read your Azure token. **Do not deploy it.** For production, replace the broker with a real backend that holds the credential server-side and proxies Foundry calls (the SPA never sees a bearer).

To disable Foundry locally (e.g., when offline) and force the OpenAI fallback:
```
VITE_DISABLE_FOUNDRY=1
```

### OpenAI fallback

1. Copy `.env.example` to `.env`
2. Set `VITE_OPENAI_API_KEY=sk-...`
3. Restart `npm run dev`

Press **Enter** to send, **Shift+Enter** for a newline.

> ⚠️ **OpenAI key warning** — Vite bundles `VITE_`-prefixed variables into the client. Anyone who loads the page can read your key. Use only for local / personal development. For production, proxy AI calls through a backend you control.

## Layout

```
Toolbar
─────────────────────────────────────────────────────
Sidebar │  TabBar / Editor          │  Run Viz (75%)
        │  ──────────────           │  ─────────────
        │  Output / Input  (tabs)   │  AI Assist (25%)
─────────────────────────────────────────────────────
StatusBar
```

All four interior dividers are draggable; double-click any divider to reset to its default size.

## Notes

- Share URLs are capped at ~6 KB. Download the ZIP for larger workspaces.
- Monaco assets load from a CDN to keep the bundle small.
- Languages without a Piston runtime (HTML/CSS/JSON/Markdown) are editor-only.
