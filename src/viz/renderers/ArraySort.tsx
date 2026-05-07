import type { ArraySortState } from '../animator';

interface Props {
  state: ArraySortState;
  width: number;
  height: number;
}

export function ArraySortRenderer({ state, width, height }: Props) {
  const n = state.values.length;
  if (n === 0) return <svg className="viz-svg" width={width} height={height} />;

  const padX = 16, padY = 24, labelGap = 16;
  const usableW = width - 2 * padX;
  const usableH = height - 2 * padY - labelGap;
  const barW = usableW / n;
  const maxV = Math.max(1, ...state.values.map(v => Math.abs(v)));
  const minV = Math.min(0, ...state.values);
  const range = Math.max(1, maxV - minV);

  function barHeight(v: number): number {
    return ((v - minV) / range) * usableH;
  }

  const inRange = (i: number) => state.range && i >= state.range[0] && i <= state.range[1];

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Range overlay */}
      {state.range && (
        <rect
          x={padX + state.range[0] * barW}
          y={padY - 4}
          width={(state.range[1] - state.range[0] + 1) * barW}
          height={usableH + 8}
          className="viz-range-overlay"
        />
      )}
      <g>
        {state.values.map((v, i) => {
          const h = barHeight(v);
          const x = padX + i * barW + 1;
          const y = padY + (usableH - h);
          let cls = 'viz-bar viz-state-idle';
          if (state.sorted.has(i)) cls = 'viz-bar viz-state-done';
          if (inRange(i)) cls = 'viz-bar viz-state-frontier';
          if (state.compare && (state.compare[0] === i || state.compare[1] === i)) cls = 'viz-bar viz-state-visiting';
          if (state.swap && (state.swap[0] === i || state.swap[1] === i)) cls = 'viz-bar viz-state-visited';
          if (state.pivot === i) cls = 'viz-bar viz-state-pivot';
          return (
            <g key={`bar-${i}`}>
              <rect
                x={x}
                y={y}
                width={Math.max(2, barW - 2)}
                height={Math.max(1, h)}
                className={cls}
                stroke="currentColor"
              />
              <text
                x={x + (barW - 2) / 2}
                y={padY + usableH + labelGap - 4}
                className="viz-bar-label"
                textAnchor="middle"
                fontSize="11"
              >{v}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
