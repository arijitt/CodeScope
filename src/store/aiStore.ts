import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chat as openaiChat, getApiKey, type ChatMessage } from '../lib/openai';
import { chat as foundryChat } from '../lib/foundry';
import { useAuth } from '../lib/auth';

const MAX_HISTORY = 50;

interface FileContext {
  language: string;
  path: string;
  code: string;
}

export type AIProvider = 'foundry' | 'openai' | 'none';

interface AIState {
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  send: (prompt: string, ctx: FileContext | null) => Promise<void>;
  clear: () => void;
}

function buildSystemPrompt(ctx: FileContext | null): string {
  if (!ctx) {
    return 'You are a concise pair programmer inside a web-based IDE. Answer in Markdown. Use fenced code blocks with language hints.';
  }
  const code = ctx.code.length > 6000 ? ctx.code.slice(0, 6000) + '\n...[truncated]' : ctx.code;
  return `You are a concise pair programmer inside a web-based IDE. The user is editing a ${ctx.language} file named "${ctx.path}". Reference it as needed. Answer in Markdown with fenced code blocks (language hint required).

Current file content:
\`\`\`${ctx.language}
${code}
\`\`\``;
}

/** Provider precedence: Azure Foundry (if signed in) > OpenAI key > none. */
export function selectProvider(): AIProvider {
  if (useAuth.getState().signedIn) return 'foundry';
  if (getApiKey()) return 'openai';
  return 'none';
}

/**
 * Shared provider router used by both the chat AI and the Phase 5 coding
 * agent. Wraps Foundry / OpenAI dispatch so callers don't have to repeat
 * the bearer/proxy logic. Throws on missing provider so callers can surface
 * the standard "sign in / set key" banner.
 */
export async function callProvider(opts: {
  instructions: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const provider = selectProvider();
  if (provider === 'none') {
    throw new Error('No AI provider available. Sign in to Azure (`az login`) or set VITE_OPENAI_API_KEY in .env and restart the dev server.');
  }
  if (provider === 'foundry') {
    return foundryChat({
      instructions: opts.instructions,
      messages: opts.messages,
      signal: opts.signal,
    });
  }
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OpenAI API key disappeared.');
  return openaiChat({
    apiKey,
    messages: [{ role: 'system', content: opts.instructions }, ...opts.messages],
    signal: opts.signal,
  });
}

export const useAI = create<AIState>()(
  persist(
    (set, get) => ({
      messages: [],
      isSending: false,
      error: null,

      send: async (prompt, ctx) => {
        const trimmed = prompt.trim();
        if (!trimmed || get().isSending) return;

        const provider = selectProvider();
        if (provider === 'none') {
          set({ error: 'No AI provider available. Sign in to Azure (`az login`) or set VITE_OPENAI_API_KEY in .env and restart the dev server.' });
          return;
        }

        const userMsg: ChatMessage = { role: 'user', content: trimmed };
        const history = [...get().messages, userMsg];
        set({ messages: history, isSending: true, error: null });

        const systemContent = buildSystemPrompt(ctx);
        const trimmedHistory = history.slice(-MAX_HISTORY);

        try {
          const reply = await callProvider({
            instructions: systemContent,
            messages: trimmedHistory,
          });
          const assistantMsg: ChatMessage = { role: 'assistant', content: reply };
          const next = [...get().messages, assistantMsg].slice(-MAX_HISTORY);
          set({ messages: next, isSending: false });
        } catch (err) {
          set({
            isSending: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      clear: () => set({ messages: [], error: null }),
    }),
    {
      name: 'web-ide.ai.v1',
      version: 1,
      partialize: (s) => ({ messages: s.messages.slice(-MAX_HISTORY) }),
    }
  )
);
