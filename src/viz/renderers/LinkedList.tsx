import type { LinkedListState } from '../animator';
import { stateClass } from './common';

interface Props {
  state: LinkedListState;
  width: number;
  height: number;
}

const BOX_W = 64;
const BOX_H = 36;
const GAP = 28;
const TOP = 80;

export function LinkedListRenderer({ state, width, height }: Props) {
  const order = state.order.filter(id => state.nodes[id]);
  const total = order.length;
  if (total === 0) return <svg className="viz-svg" width={width} height={height} />;

  // Center horizontally; if too wide, shift left.
  const fullW = total * BOX_W + (total - 1) * GAP;
  const startX = Math.max(20, (width - fullW) / 2);

  const xOf = (i: number) => startX + i * (BOX_W + GAP);

  // Build pointer name groups by node.
  const pointersByNode = new Map<string, string[]>();
  for (const [name, node] of Object.entries(state.pointers)) {
    if (!node) continue;
    const arr = pointersByNode.get(node) ?? [];
    arr.push(name);
    pointersByNode.set(node, arr);
  }

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <marker
          id="ll-arrow" viewBox="0 0 10 10" refX="10" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>

      {/* Pointers (above nodes) */}
      <g className="viz-ll-pointers">
        {order.map((id, i) => {
          const names = pointersByNode.get(id);
          if (!names || names.length === 0) return null;
          const x = xOf(i) + BOX_W / 2;
          return (
            <g key={`ptr-${id}`}>
              {names.map((n, k) => (
                <text
                  key={`ptr-${id}-${n}`}
                  x={x} y={TOP - 14 - k * 14}
                  textAnchor="middle"
                  className="viz-ll-pointer"
                  fontSize="11"
                >{n}</text>
              ))}
              <line x1={x} y1={TOP - 4} x2={x} y2={TOP} stroke="currentColor" markerEnd="url(#ll-arrow)" />
            </g>
          );
        })}
      </g>

      {/* Boxes + next links */}
      <g>
        {order.map((id, i) => {
          const node = state.nodes[id];
          const x = xOf(i);
          const y = TOP;
          const cls = state.visiting === id ? 'viz-state-visiting' : 'viz-state-idle';
          return (
            <g key={`box-${id}`} className={cls}>
              <rect x={x} y={y} width={BOX_W} height={BOX_H} className="viz-ll-box" stroke="currentColor" />
              <text
                x={x + BOX_W / 2} y={y + BOX_H / 2}
                textAnchor="middle" dominantBaseline="central"
                className="viz-ll-value" fontSize="13"
              >{String(node.value)}</text>
              <text
                x={x + BOX_W / 2} y={y + BOX_H + 14}
                textAnchor="middle"
                className="viz-ll-id" fontSize="10" opacity="0.7"
              >{id}</text>
            </g>
          );
        })}
        {order.map((id, i) => {
          const node = state.nodes[id];
          if (!node.next) return null;
          const targetIdx = order.indexOf(node.next);
          if (targetIdx === -1) return null;
          const x1 = xOf(i) + BOX_W;
          const y1 = TOP + BOX_H / 2;
          const x2 = xOf(targetIdx);
          // Bend arrow if not adjacent (so it's visible even with skip-pointers)
          if (targetIdx === i + 1) {
            return (
              <line
                key={`l-${id}`}
                x1={x1} y1={y1} x2={x2} y2={y1}
                stroke="currentColor" markerEnd="url(#ll-arrow)"
              />
            );
          }
          const dy = TOP + BOX_H + 24;
          const d = `M${x1},${y1} L${x1 + 8},${y1} L${x1 + 8},${dy} L${x2 - 8},${dy} L${x2 - 8},${y1} L${x2},${y1}`;
          return (
            <path key={`l-${id}`} d={d} stroke="currentColor" fill="none" markerEnd="url(#ll-arrow)" />
          );
        })}
      </g>
    </svg>
  );
}
