import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  StepForward,
  StepBack,
  RotateCcw,
  Loader2,
  AlertTriangle,
  X,
  Link2,
  Link2Off,
} from 'lucide-react';
import { useViz } from '../../store/vizStore';
import { useWorkspace } from '../../store/workspaceStore';
import { VIZ_CATEGORIES, VIZ_CATEGORY_LABELS, type VizCategory } from '../../viz/types';
import { VisualizationRenderer, lastNoteAt } from '../../viz/renderers/index';

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

export function RunVizPanel() {
  const status = useViz(s => s.status);
  const plan = useViz(s => s.plan);
  const trace = useViz(s => s.trace);
  const currentStep = useViz(s => s.currentStep);
  const speed = useViz(s => s.speed);
  const force = useViz(s => s.forceCategory);
  const error = useViz(s => s.error);
  const followCode = useViz(s => s.followCode);
  const staleSource = useViz(s => s.staleSource);

  const startVisualize = useViz(s => s.startVisualize);
  const cancel = useViz(s => s.cancel);
  const play = useViz(s => s.play);
  const pause = useViz(s => s.pause);
  const step = useViz(s => s.step);
  const seek = useViz(s => s.seek);
  const reset = useViz(s => s.reset);
  const setSpeed = useViz(s => s.setSpeed);
  const setForceCategory = useViz(s => s.setForceCategory);
  const setFollowCode = useViz(s => s.setFollowCode);

  const activeId = useWorkspace(s => s.activeFileId);
  const hasFile = !!activeId;

  // Measure the canvas area for the renderer.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 240 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(80, Math.floor(r.width)), h: Math.max(80, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const busy = status === 'planning' || status === 'running' || status === 'simulating';
  const hasTrace = !!trace && !!plan;
  const totalSteps = trace?.events.length ?? 0;
  const note = useMemo(() => (plan && trace ? lastNoteAt(plan, trace, currentStep) : undefined), [plan, trace, currentStep]);

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
      {/* Header / controls bar */}
      <div className="row viz-toolbar">
        <Sparkles size={14} />
        <strong>Run Visualization</strong>

        {!busy && (
          <button
            className="viz-btn primary"
            onClick={() => void startVisualize()}
            disabled={!hasFile}
            title={hasFile ? 'Visualize this file' : 'Open a file first'}
          >
            <Play size={14} /> Visualize
          </button>
        )}
        {busy && (
          <button className="viz-btn danger" onClick={cancel} title="Cancel">
            <X size={14} /> Cancel
          </button>
        )}

        <button
          className={'viz-btn' + (followCode ? ' active' : '')}
          onClick={() => setFollowCode(!followCode)}
          disabled={!hasTrace}
          title={
            !hasTrace
              ? 'No trace loaded'
              : followCode
                ? 'Follow code is ON — moving the cursor seeks the visualization, and stepping moves the cursor.'
                : 'Follow code is OFF — visualization plays without touching the editor cursor.'
          }
        >
          {followCode ? <Link2 size={14} /> : <Link2Off size={14} />} Follow code
        </button>

        <select
          className="viz-select"
          value={force ?? ''}
          onChange={(e) => setForceCategory((e.target.value || null) as VizCategory | null)}
          title="Force category (re-plan needed)"
        >
          <option value="">Auto-detect</option>
          {VIZ_CATEGORIES.map(c => (
            <option key={c} value={c}>{VIZ_CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <span className="spacer" />

        {/* Transport */}
        {hasTrace && (
          <>
            <button className="viz-btn" onClick={() => step(-1)} disabled={currentStep === 0} title="Step back">
              <StepBack size={14} />
            </button>
            {status === 'playing' ? (
              <button className="viz-btn" onClick={pause} title="Pause">
                <Pause size={14} />
              </button>
            ) : (
              <button className="viz-btn" onClick={play} disabled={totalSteps === 0} title="Play">
                <Play size={14} />
              </button>
            )}
            <button className="viz-btn" onClick={() => step(1)} disabled={currentStep >= totalSteps} title="Step forward">
              <StepForward size={14} />
            </button>
            <button className="viz-btn" onClick={reset} title="Reset to step 0">
              <RotateCcw size={14} />
            </button>
            <select
              className="viz-select"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              title="Playback speed (steps/sec)"
            >
              {SPEED_OPTIONS.map(s => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Stale-source banner */}
      {staleSource && !busy && hasTrace && (
        <div className="viz-stale-banner">
          <AlertTriangle size={12} />
          <span>Code modified since visualize — line mapping may be off.</span>
          <button
            className="viz-btn primary"
            style={{ padding: '1px 8px', fontSize: '0.85em' }}
            onClick={() => void startVisualize()}
            title="Re-plan and re-run with the current source"
          >
            Re-Visualize
          </button>
        </div>
      )}

      {/* Status row */}
      <div className="row viz-status">
        {busy && <Loader2 size={12} className="spin" />}
        {status === 'planning' && <span className="muted">Planning…</span>}
        {status === 'running' && <span className="muted">Running instrumented code…</span>}
        {status === 'simulating' && <span className="muted">Simulating with LLM…</span>}
        {plan && (
          <span className="muted">
            {VIZ_CATEGORY_LABELS[plan.category]}
            {plan.rationale ? ` · ${plan.rationale}` : ''}
          </span>
        )}
        {trace?.simulated && (
          <span className="viz-badge" title="Trace was simulated by the LLM (real instrumentation failed or unavailable).">Simulated</span>
        )}
        {trace?.truncated && (
          <span className="viz-warning" title={`Trace truncated at ${totalSteps} events.`}>
            <AlertTriangle size={12} /> truncated
          </span>
        )}
        <span className="spacer" />
        {hasTrace && (
          <span className="muted viz-step-counter">
            step {currentStep} / {totalSteps}
          </span>
        )}
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="viz-canvas" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {!plan && !busy && !error && (
          <div className="viz-empty-state">
            <div style={{ marginBottom: 6 }}>Click <strong>Visualize</strong> to detect and animate the algorithm in this file.</div>
            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Supports graph, tree, array sort, grid, linked list, recursion, and stack/queue.</div>
          </div>
        )}
        {error && (
          <div className="viz-empty-state viz-error">
            <AlertTriangle size={18} />
            <div style={{ marginTop: 6 }}>{error}</div>
          </div>
        )}
        {plan && trace && size.w > 0 && size.h > 0 && (
          <VisualizationRenderer
            plan={plan}
            trace={trace}
            step={currentStep}
            width={size.w}
            height={size.h - (note ? 22 : 0)}
          />
        )}
        {note && (
          <div className="viz-note" title={note}>{note}</div>
        )}
      </div>

      {/* Scrubber */}
      {hasTrace && totalSteps > 0 && (
        <div className="viz-scrubber">
          <input
            type="range"
            min={0}
            max={totalSteps}
            value={currentStep}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </section>
  );
}
