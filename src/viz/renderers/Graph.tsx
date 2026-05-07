import type { GraphState } from '../animator';
import { circularLayout, NODE_R, stateClass } from './common';

interface Props {
  state: GraphState;
  width: number;
  height: number;
}

export function GraphRenderer({ state, width, height }: Props) {
  const ids = state.input.nodes.map(String);
  const positions = circularLayout(ids.length, width, height);
  const posByKey = new Map<string, { x: number; y: number }>();
  ids.forEach((id, i) => posByKey.set(id, positions[i]));
  const directed = !!state.input.directed;

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {/* Edges */}
      <g className="viz-edges" stroke="currentColor" fill="none">
        {state.input.edges.map(([f, t], idx) => {
          const a = posByKey.get(String(f));
          const b = posByKey.get(String(t));
          if (!a || !b) return null;
          const key = `${f}->${t}`;
          const isHi = state.highlightedEdges.has(key) || state.highlightedEdges.has(`${t}->${f}`);
          // Shrink endpoints so arrow doesn't overlap node circles.
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const x1 = a.x + ux * NODE_R;
          const y1 = a.y + uy * NODE_R;
          const x2 = b.x - ux * NODE_R;
          const y2 = b.y - uy * NODE_R;
          return (
            <line
              key={`e${idx}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              className={isHi ? 'viz-edge-hi' : 'viz-edge'}
              strokeWidth={isHi ? 3 : 1.5}
              markerEnd={directed ? 'url(#arrow)' : undefined}
            />
          );
        })}
      </g>
      {/* Nodes */}
      <g className="viz-nodes">
        {ids.map(id => {
          const p = posByKey.get(id)!;
          const cls = stateClass(state.nodeState[id]);
          const dist = state.distance[id];
          return (
            <g key={`n${id}`} transform={`translate(${p.x},${p.y})`} className={cls}>
              <circle r={NODE_R} className="viz-node-circle" stroke="currentColor" />
              <text
                className="viz-node-label"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="13"
              >{id}</text>
              {dist !== undefined && (
                <text
                  className="viz-node-distance"
                  x={NODE_R + 4}
                  y={-NODE_R + 4}
                  fontSize="11"
                  textAnchor="start"
                >d={dist}</text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
