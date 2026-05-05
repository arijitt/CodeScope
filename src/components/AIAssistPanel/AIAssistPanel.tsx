import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useAI, selectProvider } from '../../store/aiStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useAuth } from '../../lib/auth';
import { getLanguage } from '../../lib/languages';
import { getApiKey } from '../../lib/openai';
import { getFoundryConfig } from '../../lib/foundry';
import { AuthChip } from '../AuthChip/AuthChip';

export function AIAssistPanel() {
  const messages = useAI(s => s.messages);
  const isSending = useAI(s => s.isSending);
  const error = useAI(s => s.error);
  const send = useAI(s => s.send);
  const clear = useAI(s => s.clear);

  const activeId = useWorkspace(s => s.activeFileId);
  const file = useWorkspace(s => (activeId ? s.files[activeId] : null));

  // Subscribe to auth so provider re-evaluates when sign-in state changes.
  const signedIn = useAuth(s => s.signedIn);
  const provider = selectProvider();
  void signedIn; // keep dep so React re-renders when auth flips

  const apiKey = getApiKey();
  const foundryCfg = getFoundryConfig();

  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, isSending]);

  const canSend = provider !== 'none' && !isSending && input.trim().length > 0;

  const onSend = () => {
    if (!canSend) return;
    const ctx = file
      ? { language: getLanguage(file.language).id, path: file.path, code: file.content }
      : null;
    const text = input;
    setInput('');
    void send(text, ctx);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const providerLabel =
    provider === 'foundry' ? `Azure Foundry · ${foundryCfg.deployment}`
    : provider === 'openai' ? 'OpenAI (fallback)'
    : 'No provider';

  return (
    <section
      style={{
        background: 'var(--bg-panel)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        className="row"
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-alt)',
          gap: 8,
        }}
      >
        <Bot size={14} />
        <strong>AI Assistance</strong>
        <span
          className="muted"
          title={provider === 'foundry' ? `Endpoint: ${foundryCfg.endpoint}` : providerLabel}
          style={{ fontSize: '0.85em' }}
        >
          {providerLabel}
        </span>
        <span className="spacer" />
        <AuthChip variant="panel" />
        <button onClick={clear} title="Clear conversation" disabled={messages.length === 0 && !error}>
          <Trash2 size={14} />
        </button>
      </div>

      {provider === 'none' && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--bg-alt)',
            color: 'var(--fg-muted)',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.9em',
          }}
        >
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <AlertCircle size={14} />
            <strong>No AI provider available.</strong>
          </div>
          <div>
            Sign in to Azure (run <code>az login</code> in your terminal, then click the account chip ↑) to use Azure AI Foundry,
            or set <code>VITE_OPENAI_API_KEY</code> in <code>.env</code> and restart the dev server for the OpenAI fallback.
          </div>
          {!apiKey && !signedIn && (
            <div style={{ marginTop: 4, opacity: 0.8 }}>
              Foundry endpoint: <code style={{ wordBreak: 'break-all' }}>{foundryCfg.endpoint}</code>
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className="scroll"
        style={{
          flex: 1,
          minHeight: 0,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: '1em',
        }}
      >
        {messages.length === 0 && !error && (
          <div style={{ color: 'var(--fg-muted)', textAlign: 'center', marginTop: 12 }}>
            Ask anything about your code.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`ai-msg ai-msg-${m.role}`}
          >
            <div className="ai-msg-role">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="ai-msg-body mono" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
        {isSending && (
          <div className="row" style={{ color: 'var(--fg-muted)', padding: '4px 6px' }}>
            <Loader2 size={14} className="spin" /> Thinking…
          </div>
        )}
        {error && (
          <div style={{ color: 'var(--danger)', padding: '4px 6px', whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: 6,
          display: 'flex',
          gap: 6,
          alignItems: 'flex-end',
          background: 'var(--bg-alt)',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={provider !== 'none' ? 'Ask… (Enter to send, Shift+Enter for newline)' : 'Sign in or set API key'}
          disabled={provider === 'none' || isSending}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '1em',
            background: 'var(--bg)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '6px 8px',
            minHeight: 0,
          }}
        />
        <button onClick={onSend} disabled={!canSend} className="primary" title="Send (Enter)">
          {isSending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>
    </section>
  );
}
