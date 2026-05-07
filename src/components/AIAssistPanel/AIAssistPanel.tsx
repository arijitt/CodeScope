import { useState } from 'react';
import { Bot, AlertCircle, MessageSquare, Wand2 } from 'lucide-react';
import { selectProvider } from '../../store/aiStore';
import { useAuth } from '../../lib/auth';
import { getApiKey } from '../../lib/openai';
import { getFoundryConfig } from '../../lib/foundry';
import { useAgent } from '../../store/agentStore';
import { AuthChip } from '../AuthChip/AuthChip';
import { ChatTab } from './ChatTab';
import { AgentTab } from './AgentTab';
import { DiffPreviewModal } from '../DiffPreviewModal/DiffPreviewModal';

type TabId = 'chat' | 'agent';

export function AIAssistPanel() {
  // Subscribe to auth so provider re-evaluates when sign-in state changes.
  const signedIn = useAuth(s => s.signedIn);
  const provider = selectProvider();
  void signedIn; // keep dep so React re-renders when auth flips

  const apiKey = getApiKey();
  const foundryCfg = getFoundryConfig();

  // Auto-switch to Agent tab when the agent has work to show.
  const agentStatus = useAgent((s) => s.status);
  const pendingCount = useAgent((s) => s.pendingEdits.length);

  const [tab, setTab] = useState<TabId>('chat');

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
      </div>

      {/* Tab strip */}
      <div className="row ai-tabbar" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <button
          className={`bottom-tab ${tab === 'chat' ? 'active' : ''}`}
          onClick={() => setTab('chat')}
          title="Conversational chat"
        >
          <MessageSquare size={12} /> Chat
        </button>
        <button
          className={`bottom-tab ${tab === 'agent' ? 'active' : ''}`}
          onClick={() => setTab('agent')}
          title="Multi-file coding agent"
        >
          <Wand2 size={12} /> Agent
          {(agentStatus === 'planning' || agentStatus === 'executing') && (
            <span className="agent-dot" title="Agent running" />
          )}
          {agentStatus === 'previewing' && pendingCount > 0 && (
            <span className="agent-badge">{pendingCount}</span>
          )}
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

      {tab === 'chat' ? <ChatTab /> : <AgentTab />}

      {/* Modal lives at panel scope so it overlays the whole IDE via fixed positioning. */}
      <DiffPreviewModal />
    </section>
  );
}
