import type { StackQueueState } from '../animator';

interface Props {
  state: StackQueueState;
  width: number;
  height: number;
}

const BOX = 40;
const PAD = 16;

export function StackQueueRenderer({ state, width, height }: Props) {
  const showStack = state.show.includes('stack');
  const showQueue = state.show.includes('queue');
  const colCount = (showStack ? 1 : 0) + (showQueue ? 1 : 0);
  if (colCount === 0) return <svg className="viz-svg" width={width} height={height} />;

  const colW = width / colCount;

  return (
    <svg className="viz-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {showStack && (
        <g transform={`translate(${0},0)`}>
          <text x={colW / 2} y={20} textAnchor="middle" className="viz-sq-label" fontSize="13">Stack</text>
          <StackVis
            values={state.stack}
            cx={colW / 2}
            baseY={height - PAD}
            flash={state.flash?.struct === 'stack'}
          />
        </g>
      )}
      {showQueue && (
        <g transform={`translate(${showStack ? colW : 0},0)`}>
          <text x={colW / 2} y={20} textAnchor="middle" className="viz-sq-label" fontSize="13">Queue</text>
          <QueueVis
            values={state.queue}
            cx={colW / 2}
            cy={height / 2}
            flashFront={state.flash?.struct === 'queue' && state.flash.end === 'front'}
            flashBack={state.flash?.struct === 'queue' && state.flash.end === 'back'}
          />
        </g>
      )}
    </svg>
  );
}

function StackVis({ values, cx, baseY, flash }: { values: (string | number)[]; cx: number; baseY: number; flash: boolean }) {
  const x = cx - BOX / 2;
  return (
    <g>
      {values.map((v, i) => {
        const y = baseY - (i + 1) * BOX;
        const isTop = i === values.length - 1;
        const cls = isTop && flash ? 'viz-sq-box viz-state-visiting' : 'viz-sq-box viz-state-idle';
        return (
          <g key={`s-${i}`} className={cls}>
            <rect x={x} y={y} width={BOX} height={BOX} stroke="currentColor" />
            <text x={cx} y={y + BOX / 2} textAnchor="middle" dominantBaseline="central" fontSize="13">{String(v)}</text>
          </g>
        );
      })}
      <line x1={x - 4} y1={baseY} x2={x + BOX + 4} y2={baseY} stroke="currentColor" strokeWidth={2} />
    </g>
  );
}

function QueueVis({ values, cx, cy, flashFront, flashBack }: { values: (string | number)[]; cx: number; cy: number; flashFront: boolean; flashBack: boolean }) {
  const total = values.length;
  const startX = cx - (total * BOX) / 2;
  const y = cy - BOX / 2;
  return (
    <g>
      {values.map((v, i) => {
        const x = startX + i * BOX;
        const isFront = i === 0;
        const isBack = i === values.length - 1;
        const cls = (isFront && flashFront) || (isBack && flashBack)
          ? 'viz-sq-box viz-state-visiting'
          : 'viz-sq-box viz-state-idle';
        return (
          <g key={`q-${i}`} className={cls}>
            <rect x={x} y={y} width={BOX} height={BOX} stroke="currentColor" />
            <text x={x + BOX / 2} y={y + BOX / 2} textAnchor="middle" dominantBaseline="central" fontSize="13">{String(v)}</text>
          </g>
        );
      })}
      {total > 0 && (
        <>
          <text x={startX} y={y - 6} textAnchor="middle" fontSize="10" className="viz-sq-end-label">front</text>
          <text x={startX + total * BOX} y={y - 6} textAnchor="middle" fontSize="10" className="viz-sq-end-label">back</text>
        </>
      )}
    </g>
  );
}
