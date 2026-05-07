// Existing single-file chat UI, extracted from AIAssistPanel into its own
// tab so we can mount the Phase 5 Agent tab next to it without behavior
// regressions. The shared header (provider chip + AuthChip) lives in the
// parent panel; this component only owns the conversation list + composer.

import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Loader2 } from 'lucide-react';
import { useAI, selectProvider } from '../../store/aiStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useAuth } from '../../lib/auth';
import { getLanguage } from '../../lib/languages';

export function ChatTab() {
  const messages = useAI((s) => s.messages);
  const isSending = useAI((s) => s.isSending);
  const error = useAI((s) => s.error);
  const send = useAI((s) => s.send);
  const clear = useAI((s) => s.clear);

  const activeId = useWorkspace((s) => s.activeFileId);
  const file = useWorkspace((s) => (activeId ? s.files[activeId] : null));

  const signedIn = useAuth((s) => s.signedIn);
  const provider = selectProvider();
  void signedIn;

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
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
          <div style={{ color: 'var(--danger)', padding: '4px 6px', whiteSpace: 'pre-wrap' }}>{error}</div>
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
        <button
          onClick={clear}
          disabled={messages.length === 0 && !error}
          title="Clear conversation"
        >
          <Trash2 size={14} />
        </button>
        <button onClick={onSend} disabled={!canSend} className="primary" title="Send (Enter)">
          {isSending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
