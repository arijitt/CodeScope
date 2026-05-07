// Phase 6 — Code execution visualization
// Shared types for the planner → runner/simulator → animator → renderer pipeline.

import type { LanguageId } from '../types';

export type VizCategory =
  | 'graph'
  | 'tree'
  | 'array_sort'
  | 'grid'
  | 'linked_list'
  | 'recursion_call_tree'
  | 'stack_queue';

export const VIZ_CATEGORIES: readonly VizCategory[] = [
  'graph',
  'tree',
  'array_sort',
  'grid',
  'linked_list',
  'recursion_call_tree',
  'stack_queue',
] as const;

export const VIZ_CATEGORY_LABELS: Record<VizCategory, string> = {
  graph: 'Graph',
  tree: 'Tree',
  array_sort: 'Array sort',
  grid: 'Grid',
  linked_list: 'Linked list',
  recursion_call_tree: 'Recursion tree',
  stack_queue: 'Stack / Queue',
};

// ───────────────────────── Sample-input shapes ─────────────────────────

export interface GraphInput {
  /** Node ids; rendered as labels. */
  nodes: (string | number)[];
  /** [from, to] pairs. */
  edges: [string | number, string | number][];
  directed?: boolean;
  /** Optional starting node id (for BFS/DFS). */
  start?: string | number;
}

export interface TreeInputNode {
  id: string | number;
  value?: string | number;
  children?: TreeInputNode[];
}
export type TreeInput = TreeInputNode;

export interface ArraySortInput {
  values: number[];
}

export interface GridInput {
  rows: number;
  cols: number;
  walls?: [number, number][]; // [r, c]
  start?: [number, number];
  goal?: [number, number];
  /** Initial cell values (sparse). */
  values?: { r: number; c: number; v: number | string }[];
}

export interface LinkedListInputNode {
  id: string | number;
  value: string | number;
  next?: string | number | null;
}
export interface LinkedListInput {
  head: string | number | null;
  nodes: LinkedListInputNode[];
}

/** Recursion has no pre-existing input — call tree is built from events. */
export interface RecursionInput {
  /** Top-level call args, for the root display. Optional. */
  rootCall?: string;
}

/** Stack & queue start empty; events do all the work. */
export interface StackQueueInput {
  /** Which structures to render side-by-side. */
  show: ('stack' | 'queue')[];
}

export type VizInput =
  | { category: 'graph'; data: GraphInput }
  | { category: 'tree'; data: TreeInput }
  | { category: 'array_sort'; data: ArraySortInput }
  | { category: 'grid'; data: GridInput }
  | { category: 'linked_list'; data: LinkedListInput }
  | { category: 'recursion_call_tree'; data: RecursionInput }
  | { category: 'stack_queue'; data: StackQueueInput };

// ─────────────────────────── Step events ───────────────────────────────

export type NodeStateName = 'idle' | 'frontier' | 'visiting' | 'visited' | 'done';

export type GraphEvent =
  | { t: 'set_state'; node: string | number; state: NodeStateName }
  | { t: 'visit'; node: string | number }
  | { t: 'enqueue'; node: string | number }
  | { t: 'dequeue'; node: string | number }
  | { t: 'push'; node: string | number }
  | { t: 'pop'; node: string | number }
  | { t: 'highlight_edge'; from: string | number; to: string | number }
  | { t: 'set_distance'; node: string | number; distance: number }
  | { t: 'note'; text: string };

export type TreeEvent =
  | { t: 'enter'; node: string | number }
  | { t: 'leave'; node: string | number }
  | { t: 'visit'; node: string | number }
  | { t: 'set_state'; node: string | number; state: NodeStateName }
  | { t: 'highlight_edge'; from: string | number; to: string | number }
  | { t: 'set_value'; node: string | number; value: string | number }
  | { t: 'note'; text: string };

export type ArraySortEvent =
  | { t: 'compare'; i: number; j: number }
  | { t: 'swap'; i: number; j: number }
  | { t: 'set'; i: number; v: number }
  | { t: 'mark_sorted'; i: number }
  | { t: 'highlight_range'; lo: number; hi: number }
  | { t: 'pivot'; i: number }
  | { t: 'note'; text: string };

export type GridEvent =
  | { t: 'visit'; r: number; c: number }
  | { t: 'set_state'; r: number; c: number; state: NodeStateName }
  | { t: 'set_value'; r: number; c: number; v: number | string }
  | { t: 'highlight_path'; path: [number, number][] }
  | { t: 'note'; text: string };

export type LinkedListEvent =
  | { t: 'visit'; node: string | number }
  | { t: 'set_pointer'; name: string; node: string | number | null }
  | { t: 'set_next'; node: string | number; target: string | number | null }
  | { t: 'insert'; after: string | number | null; node: LinkedListInputNode }
  | { t: 'delete'; node: string | number }
  | { t: 'note'; text: string };

export type RecursionEvent =
  | { t: 'call'; id: number; parent: number | null; fn: string; args: string }
  | { t: 'return'; id: number; value: string }
  | { t: 'highlight'; id: number }
  | { t: 'note'; text: string };

export type StackQueueEvent =
  | { t: 'push'; struct: 'stack'; value: string | number }
  | { t: 'pop'; struct: 'stack' }
  | { t: 'enqueue'; struct: 'queue'; value: string | number }
  | { t: 'dequeue'; struct: 'queue' }
  | { t: 'peek'; struct: 'stack' | 'queue' }
  | { t: 'note'; text: string };

export type VizEvent =
  | GraphEvent
  | TreeEvent
  | ArraySortEvent
  | GridEvent
  | LinkedListEvent
  | RecursionEvent
  | StackQueueEvent;

// ─────────────────────────── Plan & trace ──────────────────────────────

export interface VizPlan {
  category: VizCategory;
  /** AI confidence 0..1 (informational). */
  confidence?: number;
  language: LanguageId;
  input: VizInput;
  /**
   * Source rewritten with `__VIZ__:{json}` probes. For runner mode.
   * If absent, the orchestrator goes straight to the simulator.
   */
  instrumentedCode?: string;
  /** Stdin to feed when running instrumentedCode. */
  stdin?: string;
  /** Brief one-line note about what we think this code does. */
  rationale?: string;
}

export interface VizTrace {
  events: VizEvent[];
  truncated: boolean;
  /** True when produced by the LLM simulator (no real execution). */
  simulated: boolean;
}

export type VizStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'simulating'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'
  | 'cancelled';
