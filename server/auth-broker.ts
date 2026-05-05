// Dev-only auth broker mounted into the Vite dev server.
//
// Why: the SPA needs an Azure AD bearer token for the user's own identity in
// order to call Azure AI Foundry, but DefaultAzureCredential is a Node-only
// primitive — it cannot run in a browser. Rather than wire MSAL.js (which
// would require an app registration / clientId), we mint the token here, in
// the same Node process as `vite dev`, and surface it to the SPA via a
// localhost-only HTTP endpoint.
//
// SECURITY: this is a developer convenience. It MUST NOT be used in
// production: any local process can hit localhost and read your bearer.
// Production should proxy Foundry calls through a real backend.

import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DefaultAzureCredential, type AccessToken } from '@azure/identity';

const SCOPE = 'https://cognitiveservices.azure.com/.default';
// Refresh a minute before actual expiry to avoid races with in-flight calls.
const REFRESH_LEEWAY_MS = 60_000;

const DEFAULT_FOUNDRY_ENDPOINT = 'https://defaultfoundryresource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview';

interface ClaimsView {
  upn?: string;
  name?: string;
  tid?: string;
}

interface BrokerState {
  credential: DefaultAzureCredential;
  cached: AccessToken | null;
  claims: ClaimsView | null;
  lastError: string | null;
}

function decodeJwtClaims(token: string): ClaimsView {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    // base64url -> base64
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(json) as Record<string, unknown>;
    return {
      upn: typeof obj.upn === 'string' ? obj.upn
         : typeof obj.preferred_username === 'string' ? obj.preferred_username
         : typeof obj.unique_name === 'string' ? obj.unique_name
         : undefined,
      name: typeof obj.name === 'string' ? obj.name : undefined,
      tid: typeof obj.tid === 'string' ? obj.tid : undefined,
    };
  } catch {
    return {};
  }
}

function isLocalhost(req: IncomingMessage): boolean {
  // Vite dev server binds to localhost by default. Reject anything else so a
  // peer on the LAN can't yank the token.
  const ra = req.socket.remoteAddress ?? '';
  return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function ensureToken(state: BrokerState): Promise<AccessToken> {
  const now = Date.now();
  if (state.cached && state.cached.expiresOnTimestamp - REFRESH_LEEWAY_MS > now) {
    return state.cached;
  }
  const tok = await state.credential.getToken(SCOPE);
  if (!tok) throw new Error('DefaultAzureCredential returned no token. Run `az login` or set Azure env credentials.');
  state.cached = tok;
  state.claims = decodeJwtClaims(tok.token);
  state.lastError = null;
  return tok;
}

export interface AuthBrokerOptions {
  /** Set true to disable the broker entirely (useful in CI or when offline). */
  disabled?: boolean;
}

export function createAuthBrokerPlugin(opts: AuthBrokerOptions = {}): Plugin {
  const disabled = opts.disabled || process.env.VITE_DISABLE_FOUNDRY === '1';
  const state: BrokerState = {
    credential: new DefaultAzureCredential(),
    cached: null,
    claims: null,
    lastError: null,
  };

  return {
    name: 'web-ide:auth-broker',
    apply: 'serve',
    configureServer(server) {
      if (disabled) {
        server.config.logger.info('[auth-broker] disabled (VITE_DISABLE_FOUNDRY=1)');
        return;
      }
      // Try to mint a token at startup so the developer sees their identity in the log.
      ensureToken(state).then(
        () => server.config.logger.info(`[auth-broker] ready (account: ${state.claims?.upn ?? state.claims?.name ?? 'unknown'})`),
        (err: unknown) => {
          state.lastError = err instanceof Error ? err.message : String(err);
          server.config.logger.warn(`[auth-broker] no credential at startup — sign in via \`az login\`. (${state.lastError})`);
        },
      );

      const handler: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url ?? '';
        const isAuth = url.startsWith('/auth/');
        const isFoundry = url === '/foundry';
        if (!isAuth && !isFoundry) return next();
        if (!isLocalhost(req)) {
          sendJson(res, 403, { error: 'auth broker is localhost-only' });
          return;
        }

        if (url === '/auth/me' && req.method === 'GET') {
          ensureToken(state).then(
            (tok) => sendJson(res, 200, {
              signedIn: true,
              upn: state.claims?.upn ?? state.claims?.name ?? null,
              name: state.claims?.name ?? null,
              tenantId: state.claims?.tid ?? null,
              expiresOn: tok.expiresOnTimestamp,
            }),
            (err: unknown) => sendJson(res, 200, {
              signedIn: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          return;
        }

        if (url === '/auth/token' && req.method === 'GET') {
          ensureToken(state).then(
            (tok) => sendJson(res, 200, { token: tok.token, expiresOnTimestamp: tok.expiresOnTimestamp }),
            (err: unknown) => sendJson(res, 401, { error: err instanceof Error ? err.message : String(err) }),
          );
          return;
        }

        if (url === '/auth/signout' && req.method === 'POST') {
          state.cached = null;
          state.claims = null;
          sendJson(res, 200, { signedOut: true });
          return;
        }

        // POST /foundry — server-side proxy to the Foundry endpoint.
        // The browser cannot call the Azure endpoint directly because Foundry
        // does not send CORS headers for localhost. We proxy here so that:
        //   1. The browser only talks to same-origin (no CORS).
        //   2. The user's AAD bearer never leaves this Node process.
        // Body shape: { endpoint?: string, payload: <Responses API body> }
        if (url === '/foundry' && req.method === 'POST') {
          (async () => {
            try {
              const tok = await ensureToken(state);
              const raw = await readBody(req);
              const parsed = JSON.parse(raw || '{}') as { endpoint?: string; payload?: unknown };
              const endpoint = (parsed.endpoint && typeof parsed.endpoint === 'string')
                ? parsed.endpoint
                : (process.env.VITE_FOUNDRY_ENDPOINT || DEFAULT_FOUNDRY_ENDPOINT);
              const upstream = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${tok.token}`,
                },
                body: JSON.stringify(parsed.payload ?? {}),
              });
              const text = await upstream.text();
              if (upstream.status === 401) {
                // Token may have been revoked; drop cache so the next call refreshes.
                state.cached = null;
              }
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.end(text);
            } catch (err) {
              sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) });
            }
          })();
          return;
        }

        sendJson(res, 404, { error: 'not found' });
      };

      server.middlewares.use(handler);
    },
  };
}
