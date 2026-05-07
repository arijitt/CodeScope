import type { RecursionState, RecursionFrame } from '../animator';
import { stateClass } from './common';

interface Props {
  state: RecursionState;
  width: number;
  height: number;
}

interface Positioned extends RecursionFrame {
  x: number;
  y: number;
  depth: number;
}

const NODE_W = 130;
const NODE_H = 32;
const HGAP = 14;
const VGAP = 18;

export function RecursionTreeRenderer({ state, width, height }: Props) {
  const frames = state.order.map(id => state.frames[id]).filter(Boolean) as RecursionFrame[];
  if (frames.length === 0) {
    return (
      <svg className="viz-svg" width={width} height={height}>
        <text x={width / 2} y={height / 2} className="viz-empty" textAnchor="middle">No calls yet.</text>
      </svg>
    );
  }

  // Build children index in call order.
  const childrenOf = new Map<number | null, number[]>();
  for (const f of frames) {
    const arr = childrenOf.get(f.parent) ?? [];
    arr.push(f.id);
    childrenOf.set(f.parent, arr);
  }
  const roots = childrenOf.get(null) ?? [];

  const depthOf = new Map<number, number>();
  function setDepth(id: number, d: number): void {
    depthOf.set(id, d);
    for (const c of childrenOf.get(id) ?? []) setDepth(c, d + 1);
  }
  roots.forEach(r => setDepth(r, 0));

  // Width = leaves * (NODE_W+HGAP).
  const leafCountOf = new Map<number, number>();
  function leaves(id: number): number {
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) { leafCountOf.set(id, 1); return 1; }
    let s = 0;
    for (const k of kids) s += leaves(k);
    leafCountOf.set(id, s);
    return s;
  }
  let totalLeaves = 0;
  for (const r of roots) totalLeaves += leaves(r);

  const positioned: Positioned[] = [];
  function place(id: number, leftLeafIdx: number): number {
    const f = state.frames[id];
    const kids = childrenOf.get(id) ?? [];
    let center: number;
    if (kids.length === 0) center = leftLeafIdx + 0.5;
    else {
      let cursor = leftLeafIdx;
      const centers: number[] = [];
      for (const k of kids) {
        centers.push(place(k, cursor));
        cursor += leafCountOf.get(k) ?? 1;
      }
      center = (centers[0] + centers[centers.length - 1]) / 2;
    }
    const depth = depthOf.get(id) ?? 0;
    const x = 12 + center * (NODE_W + HGAP);
    const y = 12 + depth * (NODE_H + VGAP);
    positioned.push({ ...f, x, y, depth });
    return center;
  }
  let cursor = 0;
  for (const r of roots) {
    place(r, cursor);
    cursor += leafCountOf.get(r) ?? 1;
  }

  const innerW = totalLeaves * (NODE_W + HGAP) + 24;
  const innerH = (Math.max(0, ...Array.from(depthOf.values())) + 1) * (NODE_H + VGAP) + 24;
  const vbW = Math.max(width, innerW);
  const vbH = Math.max(height, innerH);

  const byId = new Map<number, Positioned>();
  positioned.forEach(p => byId.set(p.id, p));

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMinYMin meet">
      <g className="viz-edges" stroke="currentColor" fill="none">
        {positioned.filter(p => p.parent !== null).map(p => {
          const par = byId.get(p.parent!);
          if (!par) return null;
          return (
            <line
              key={`re-${p.id}`}
              x1={par.x + NODE_W / 2} y1={par.y + NODE_H}
              x2={p.x + NODE_W / 2}   y2={p.y}
              className="viz-edge"
              strokeWidth={1.5}
            />
          );
        })}
      </g>
      <g>
        {positioned.map(p => {
          const cls = state.highlight === p.id
            ? 'viz-state-visiting'
            : (p.returned ? 'viz-state-done' : 'viz-state-frontier');
          const label = `${p.fn}(${p.args})`;
          return (
            <g key={`r-${p.id}`} className={cls}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} className="viz-rec-box" stroke="currentColor" />
              <text
                x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 - (p.returned ? 7 : 0)}
                textAnchor="middle" dominantBaseline="central"
                className="viz-rec-label" fontSize="11"
              >{label.length > 22 ? label.slice(0, 21) + '…' : label}</text>
              {p.returned && p.value !== undefined && (
                <text
                  x={p.x + NODE_W / 2} y={p.y + NODE_H - 6}
                  textAnchor="middle"
                  className={`viz-rec-return ${stateClass('done')}`}
                  fontSize="10"
                >→ {String(p.value).length > 18 ? String(p.value).slice(0, 17) + '…' : p.value}</text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
