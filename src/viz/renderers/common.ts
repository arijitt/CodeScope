// Phase 6 — Shared renderer helpers.
// All SVG renderers share these color tokens and the simple "viewport
// auto-fit" pattern. Light/dark theming is handled at the CSS layer via
// `currentColor` on stroke/fill where possible.

import type { NodeStateName } from '../types';

/**
 * Map a node-state name to a CSS class that gives it the right fill
 * (defined in global.css under `.viz-state-*`). Renderers also set
 * stroke="currentColor" so dark/light themes get correct outlines.
 */
export function stateClass(state: NodeStateName | undefined): string {
  switch (state) {
    case 'frontier': return 'viz-state-frontier';
    case 'visiting': return 'viz-state-visiting';
    case 'visited':  return 'viz-state-visited';
    case 'done':     return 'viz-state-done';
    default:         return 'viz-state-idle';
  }
}

/** Squeeze a value into a min-max range. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Lay out N items on a circle inside a [0..w]×[0..h] viewport.
 * Used by the graph renderer for small graphs (cheap & deterministic).
 */
export function circularLayout(count: number, w: number, h: number, pad = 32): { x: number; y: number }[] {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.max(40, Math.min(w, h) / 2 - pad);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (count === 1) { out.push({ x: cx, y: cy }); continue; }
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

export const NODE_R = 18;
