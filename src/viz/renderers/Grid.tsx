import type { GridState } from '../animator';
import { stateClass } from './common';

interface Props {
  state: GridState;
  width: number;
  height: number;
}

export function GridRenderer({ state, width, height }: Props) {
  const { rows, cols } = state;
  if (rows <= 0 || cols <= 0) return <svg className="viz-svg" width={width} height={height} />;

  const pad = 12;
  const cellSize = Math.floor(Math.min((width - 2 * pad) / cols, (height - 2 * pad) / rows));
  const gridW = cellSize * cols;
  const gridH = cellSize * rows;
  const ox = (width - gridW) / 2;
  const oy = (height - gridH) / 2;

  const cells: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      const isWall = state.walls.has(key);
      const cls = isWall ? 'viz-cell viz-cell-wall' : `viz-cell ${stateClass(state.cellState[key])}`;
      const v = state.values[key];
      const cx = ox + c * cellSize;
      const cy = oy + r * cellSize;
      cells.push(
        <g key={`c-${key}`}>
          <rect
            x={cx} y={cy} width={cellSize} height={cellSize}
            className={cls}
            stroke="currentColor"
          />
          {v !== undefined && (
            <text
              x={cx + cellSize / 2} y={cy + cellSize / 2}
              className="viz-cell-value"
              textAnchor="middle" dominantBaseline="central"
              fontSize={Math.max(10, Math.min(16, cellSize * 0.4))}
            >{String(v)}</text>
          )}
        </g>
      );
    }
  }

  // Path overlay (polyline through cell centers).
  let pathPath: string | null = null;
  if (state.path && state.path.length > 1) {
    pathPath = state.path
      .map(([r, c], i) => `${i === 0 ? 'M' : 'L'}${ox + c * cellSize + cellSize / 2},${oy + r * cellSize + cellSize / 2}`)
      .join(' ');
  }

  // Markers
  const markerR = Math.max(4, cellSize * 0.18);

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <g>{cells}</g>
      {pathPath && (
        <path d={pathPath} className="viz-grid-path" stroke="currentColor" fill="none" strokeWidth={3} />
      )}
      {state.start && (
        <circle
          cx={ox + state.start[1] * cellSize + cellSize / 2}
          cy={oy + state.start[0] * cellSize + cellSize / 2}
          r={markerR}
          className="viz-marker-start"
        />
      )}
      {state.goal && (
        <rect
          x={ox + state.goal[1] * cellSize + cellSize / 2 - markerR}
          y={oy + state.goal[0] * cellSize + cellSize / 2 - markerR}
          width={markerR * 2} height={markerR * 2}
          className="viz-marker-goal"
        />
      )}
    </svg>
  );
}
