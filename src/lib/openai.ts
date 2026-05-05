// Minimal browser client for OpenAI's Chat Completions API.
// SECURITY NOTE: VITE_OPENAI_API_KEY is bundled into the client. Use only for
// local/personal development. For anything public, proxy via a backend.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function chat(opts: ChatOptions): Promise<string> {
  if (!opts.apiKey) throw new Error('OpenAI API key is not configured. Set VITE_OPENAI_API_KEY in .env and restart the dev server.');

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? 'gpt-4o-mini',
      messages: opts.messages,
      temperature: 0.3,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message ?? '';
    } catch { /* ignore */ }
    throw new Error(`OpenAI request failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned an empty response.');
  return text;
}

export function getApiKey(): string | null {
  const k = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
  return k.trim() || null;
}
