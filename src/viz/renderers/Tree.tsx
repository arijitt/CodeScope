import type { TreeState } from '../animator';
import type { TreeInputNode } from '../types';
import { NODE_R, stateClass } from './common';

interface Props {
  state: TreeState;
  width: number;
  height: number;
}

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  parent?: string;
  value?: string | number;
}

/**
 * Width-by-subtree layout. Each leaf gets one column; an internal node sits
 * over the centroid of its children. Cheap, deterministic, no overlap.
 */
function layoutTree(root: TreeInputNode, width: number, height: number, valuesOverride: Record<string, string | number>): PositionedNode[] {
  // First compute leaf count per subtree to assign column widths.
  const leafCount = new Map<string, number>();
  function countLeaves(n: TreeInputNode): number {
    const kids = n.children ?? [];
    if (kids.length === 0) { leafCount.set(String(n.id), 1); return 1; }
    let sum = 0;
    for (const c of kids) sum += countLeaves(c);
    leafCount.set(String(n.id), sum);
    return sum;
  }
  countLeaves(root);

  // Then compute depth.
  let maxDepth = 0;
  function computeDepth(n: TreeInputNode, d: number): void {
    if (d > maxDepth) maxDepth = d;
    for (const c of n.children ?? []) computeDepth(c, d + 1);
  }
  computeDepth(root, 0);

  const totalLeaves = leafCount.get(String(root.id)) ?? 1;
  const colWidth = (width - 2 * NODE_R - 16) / Math.max(1, totalLeaves);
  const rowHeight = (height - 2 * NODE_R - 16) / Math.max(1, maxDepth + 1);

  const out: PositionedNode[] = [];
  function assign(n: TreeInputNode, depth: number, leftLeafIdx: number, parent?: string): number {
    const kids = n.children ?? [];
    const id = String(n.id);
    let centerLeaf: number;
    if (kids.length === 0) {
      centerLeaf = leftLeafIdx + 0.5;
    } else {
      let cursor = leftLeafIdx;
      const childCenters: number[] = [];
      for (const c of kids) {
        childCenters.push(assign(c, depth + 1, cursor, id));
        cursor += leafCount.get(String(c.id)) ?? 1;
      }
      centerLeaf = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    }
    const x = NODE_R + 8 + centerLeaf * colWidth;
    const y = NODE_R + 8 + depth * rowHeight;
    const value = valuesOverride[id] ?? n.value;
    out.push({ id, x, y, parent, value });
    return centerLeaf;
  }
  assign(root, 0, 0);
  return out;
}

export function TreeRenderer({ state, width, height }: Props) {
  const positioned = layoutTree(state.root, width, height, state.values);
  const byId = new Map<string, PositionedNode>();
  positioned.forEach(p => byId.set(p.id, p));

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <g className="viz-edges" stroke="currentColor" fill="none">
        {positioned.filter(p => p.parent).map(p => {
          const par = byId.get(p.parent!);
          if (!par) return null;
          const key = `${par.id}->${p.id}`;
          const isHi = state.highlightedEdges.has(key);
          return (
            <line
              key={`e-${p.id}`}
              x1={par.x} y1={par.y + NODE_R}
              x2={p.x}   y2={p.y - NODE_R}
              className={isHi ? 'viz-edge-hi' : 'viz-edge'}
              strokeWidth={isHi ? 3 : 1.5}
            />
          );
        })}
      </g>
      <g className="viz-nodes">
        {positioned.map(p => {
          const cls = stateClass(state.nodeState[p.id]);
          const label = p.value !== undefined ? String(p.value) : String(p.id);
          return (
            <g key={`n-${p.id}`} transform={`translate(${p.x},${p.y})`} className={cls}>
              <circle r={NODE_R} className="viz-node-circle" stroke="currentColor" />
              <text
                className="viz-node-label"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="12"
              >{label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
