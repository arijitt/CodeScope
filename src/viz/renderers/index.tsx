// Phase 6 — Renderer dispatcher.
// Picks the right SVG renderer based on plan.category and feeds it the
// per-step state computed by the animator.

import type { VizPlan, VizTrace } from '../types';
import { stateAt } from '../animator';
import { GraphRenderer } from './Graph';
import { TreeRenderer } from './Tree';
import { ArraySortRenderer } from './ArraySort';
import { GridRenderer } from './Grid';
import { LinkedListRenderer } from './LinkedList';
import { RecursionTreeRenderer } from './RecursionTree';
import { StackQueueRenderer } from './StackQueue';
import type {
  ArraySortState,
  GraphState,
  GridState,
  LinkedListState,
  RecursionState,
  StackQueueState,
  TreeState,
} from '../animator';

interface Props {
  plan: VizPlan;
  trace: VizTrace;
  step: number;
  width: number;
  height: number;
}

export function VisualizationRenderer({ plan, trace, step, width, height }: Props) {
  const state = stateAt(plan, trace.events, step);
  switch (plan.category) {
    case 'graph':
      return <GraphRenderer state={state as GraphState} width={width} height={height} />;
    case 'tree':
      return <TreeRenderer state={state as TreeState} width={width} height={height} />;
    case 'array_sort':
      return <ArraySortRenderer state={state as ArraySortState} width={width} height={height} />;
    case 'grid':
      return <GridRenderer state={state as GridState} width={width} height={height} />;
    case 'linked_list':
      return <LinkedListRenderer state={state as LinkedListState} width={width} height={height} />;
    case 'recursion_call_tree':
      return <RecursionTreeRenderer state={state as RecursionState} width={width} height={height} />;
    case 'stack_queue':
      return <StackQueueRenderer state={state as StackQueueState} width={width} height={height} />;
  }
}

/** Get the most recent "note" text across applied events for the status footer. */
export function lastNoteAt(plan: VizPlan, trace: VizTrace, step: number): string | undefined {
  const s = stateAt(plan, trace.events, step) as { lastNote?: string };
  return s.lastNote;
}
