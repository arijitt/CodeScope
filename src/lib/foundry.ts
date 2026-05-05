// Azure AI Foundry client — Responses API.
//
// Calls the configured Foundry endpoint VIA THE LOCAL DEV BROKER PROXY
// (POST /foundry). The browser cannot call Azure directly because Foundry
// does not send CORS headers for localhost; the broker forwards the request
// server-side using the user's AAD bearer (which never leaves Node).

import type { ChatMessage } from './openai';

const DEFAULT_ENDPOINT = 'https://defaultfoundryresource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview';
const DEFAULT_DEPLOYMENT = 'gpt-5.3-codex';

function endpoint(): string {
  return ((import.meta.env.VITE_FOUNDRY_ENDPOINT as string | undefined) ?? '').trim() || DEFAULT_ENDPOINT;
}

function deployment(): string {
  return ((import.meta.env.VITE_FOUNDRY_DEPLOYMENT as string | undefined) ?? '').trim() || DEFAULT_DEPLOYMENT;
}

/** Kept exported for compatibility; no-op now that the broker holds the token. */
export function clearTokenCache(): void {
  /* token lives in the broker process */
}

export interface FoundryChatOptions {
  messages: ChatMessage[];
  /** System prompt — surfaced as `instructions` on the Responses API. */
  instructions?: string;
  signal?: AbortSignal;
}

interface ResponsesContentItem { type?: string; text?: string }
interface ResponsesOutputItem { type?: string; content?: ResponsesContentItem[]; text?: string }
interface ResponsesPayload { output_text?: string; output?: ResponsesOutputItem[] }

function extractText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const out = payload.output;
  if (!Array.isArray(out)) return '';
  const parts: string[] = [];
  for (const item of out) {
    if (typeof item.text === 'string') parts.push(item.text);
    if (Array.isArray(item.content)) {
      for (const c of item.content) {
        if (typeof c.text === 'string') parts.push(c.text);
      }
    }
  }
  return parts.join('').trim();
}

export async function chat(opts: FoundryChatOptions): Promise<string> {
  // Translate ChatMessage[] -> Responses API input items.
  // 'system' messages get hoisted into the top-level `instructions` field.
  const sysFromMessages = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const instructions = [opts.instructions ?? '', sysFromMessages].filter(Boolean).join('\n\n');
  const input = opts.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }],
    }));

  const payload = {
    model: deployment(),
    instructions: instructions || undefined,
    input,
  };

  let res: Response;
  try {
    res = await fetch('/foundry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: endpoint(), payload }),
      signal: opts.signal,
    });
  } catch (err) {
    throw new Error(`Cannot reach Foundry broker at /foundry. Is \`npm run dev\` running and are you signed in (\`az login\`)? (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error?.message ?? j?.error ?? ''; } catch { /* ignore */ }
    throw new Error(`Foundry request failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  const data = await res.json() as ResponsesPayload;
  const text = extractText(data);
  if (!text) throw new Error('Foundry returned an empty response.');
  return text;
}

export function getFoundryConfig(): { endpoint: string; deployment: string } {
  return { endpoint: endpoint(), deployment: deployment() };
}
