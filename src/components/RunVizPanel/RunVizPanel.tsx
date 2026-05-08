import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useViz } from '../../store/vizStore';
import { useWorkspace } from '../../store/workspaceStore';
import { VIZ_CATEGORIES, VIZ_CATEGORY_LABELS, type VizCategory } from '../../viz/types';
import { VisualizationRenderer, lastNoteAt } from '../../viz/renderers/index';

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

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
  const zoom = useViz(s => s.zoom);

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
  const zoomIn = useViz(s => s.zoomIn);
  const zoomOut = useViz(s => s.zoomOut);
  const resetZoom = useViz(s => s.resetZoom);

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
        {!busy && (
          <button
            className="viz-btn primary"
            onClick={() => void startVisualize()}
            disabled={!hasFile}
            title={hasFile ? 'Run visualization for this file' : 'Open a file first'}
          >
            <Play size={20} /> Run Visualization
          </button>
        )}
        {busy && (
          <button className="viz-btn danger" onClick={cancel} title="Cancel">
            <X size={20} /> Cancel
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
          {followCode ? <Link2 size={20} /> : <Link2Off size={20} />} Follow code
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
      </div>

      {/* Transport row — always visible; disabled until a trace is loaded. */}
      <div className="row viz-toolbar viz-transport">
        <button
          className="viz-btn viz-btn-icon"
          onClick={() => step(-1)}
          disabled={!hasTrace || currentStep === 0}
          title="Step back"
        >
          <StepBack size={20} />
        </button>
        {status === 'playing' ? (
          <button className="viz-btn viz-btn-icon" onClick={pause} title="Pause">
            <Pause size={20} />
          </button>
        ) : (
          <button
            className="viz-btn viz-btn-icon"
            onClick={play}
            disabled={!hasTrace || totalSteps === 0}
            title="Play"
          >
            <Play size={20} />
          </button>
        )}
        <button
          className="viz-btn viz-btn-icon"
          onClick={() => step(1)}
          disabled={!hasTrace || currentStep >= totalSteps}
          title="Step forward"
        >
          <StepForward size={20} />
        </button>
        <button
          className="viz-btn viz-btn-icon"
          onClick={reset}
          disabled={!hasTrace}
          title="Restart (reset to step 0)"
        >
          <RotateCcw size={20} />
        </button>
        <select
          className="viz-select"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          disabled={!hasTrace}
          title="Playback speed (steps/sec)"
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
        <span className="spacer" />
        <button
          className="viz-btn viz-btn-icon"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN + 1e-6}
          title="Zoom out (Ctrl + scroll)"
          aria-label="Zoom out"
        >
          <ZoomOut size={20} />
        </button>
        <button
          className="viz-btn viz-zoom-pct"
          onClick={resetZoom}
          disabled={Math.abs(zoom - 1) < 1e-6}
          title="Reset zoom to 100%"
          aria-label={`Current zoom ${Math.round(zoom * 100)} percent — click to reset`}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="viz-btn viz-btn-icon"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX - 1e-6}
          title="Zoom in (Ctrl + scroll)"
          aria-label="Zoom in"
        >
          <ZoomIn size={20} />
        </button>
      </div>

      {/* Stale-source banner */}
      {staleSource && !busy && hasTrace && (
        <div className="viz-stale-banner">
          <AlertTriangle size={12} />
          <span>Code modified since visualize — line mapping may be off.</span>
          <button
            className="viz-btn primary"
            style={{ padding: '1px 8px', fontSize: '0.85em', height: 'auto' }}
            onClick={() => void startVisualize()}
            title="Re-plan and re-run with the current source"
          >
            Re-run Visualization
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
            <div style={{ marginBottom: 6 }}>Click <strong>Run Visualization</strong> to detect and animate the algorithm in this file.</div>
            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Supports graph, tree, array sort, grid, linked list, recursion, and stack/queue.</div>
          </div>
        )}
        {error && (
          <div className="viz-empty-state viz-error">
            <AlertTriangle size={18} />
            <div style={{ marginTop: 6 }}>{error}</div>
          </div>
        )}
        {plan && trace && size.w > 0 && size.h > 0 && (() => {
          const renderH = size.h - (note ? 22 : 0);
          const zoomedIn = zoom > 1 + 1e-6;
          return (
            <div
              className="viz-scale-outer"
              style={{
                bottom: note ? 22 : 0,
                alignItems: zoomedIn ? 'flex-start' : 'center',
                justifyContent: zoomedIn ? 'flex-start' : 'center',
              }}
              onWheel={(e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                if (e.deltaY < 0) zoomIn();
                else if (e.deltaY > 0) zoomOut();
              }}
            >
              <div
                className="viz-scale-inner"
                style={{ width: size.w * zoom, height: renderH * zoom }}
              >
                <div
                  style={{
                    width: size.w,
                    height: renderH,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0',
                  }}
                >
                  <VisualizationRenderer
                    plan={plan}
                    trace={trace}
                    step={currentStep}
                    width={size.w}
                    height={renderH}
                  />
                </div>
              </div>
            </div>
          );
        })()}
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
