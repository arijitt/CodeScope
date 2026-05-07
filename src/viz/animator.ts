// Phase 6 — Per-category state reducers + stateAt(events, step) helpers.
// Pure functions; no React. Renderers compute their visible state by calling
// stateAt(plan, trace.events, currentStep).

import type {
  ArraySortEvent,
  ArraySortInput,
  GraphEvent,
  GraphInput,
  GridEvent,
  GridInput,
  LinkedListEvent,
  LinkedListInput,
  LinkedListInputNode,
  NodeStateName,
  RecursionEvent,
  StackQueueEvent,
  StackQueueInput,
  TreeEvent,
  TreeInput,
  TreeInputNode,
  VizEvent,
  VizPlan,
} from './types';

// ───────────────────────── Graph ──────────────────────────────────────

export interface GraphState {
  input: GraphInput;
  /** Per-node visualization state. */
  nodeState: Record<string, NodeStateName>;
  /** Distance label per node, if set. */
  distance: Record<string, number>;
  /** Highlighted edges, encoded as "from->to". */
  highlightedEdges: Set<string>;
  /** Working frontier order — derived from enqueue/push minus dequeue/pop, for display. */
  frontier: string[];
  visited: string[];
  /** Last note text, for the status footer. */
  lastNote?: string;
}

function graphInitial(input: GraphInput): GraphState {
  const nodeState: Record<string, NodeStateName> = {};
  for (const n of input.nodes) nodeState[String(n)] = 'idle';
  return {
    input,
    nodeState,
    distance: {},
    highlightedEdges: new Set(),
    frontier: [],
    visited: [],
  };
}

function applyGraph(s: GraphState, ev: GraphEvent): GraphState {
  const ns = s.nodeState;
  const dist = s.distance;
  const eh = s.highlightedEdges;
  const fr = s.frontier;
  const vis = s.visited;
  switch (ev.t) {
    case 'set_state': {
      const key = String(ev.node);
      return { ...s, nodeState: { ...ns, [key]: ev.state } };
    }
    case 'visit': {
      const key = String(ev.node);
      const newVis = vis.includes(key) ? vis : [...vis, key];
      return { ...s, nodeState: { ...ns, [key]: 'visiting' }, visited: newVis };
    }
    case 'enqueue':
    case 'push': {
      const key = String(ev.node);
      return {
        ...s,
        nodeState: { ...ns, [key]: ns[key] === 'visited' ? 'visited' : 'frontier' },
        frontier: fr.includes(key) ? fr : [...fr, key],
      };
    }
    case 'dequeue':
    case 'pop': {
      const key = String(ev.node);
      const idx = fr.indexOf(key);
      const newFr = idx === -1 ? fr : [...fr.slice(0, idx), ...fr.slice(idx + 1)];
      return { ...s, frontier: newFr };
    }
    case 'highlight_edge': {
      const next = new Set(eh);
      next.add(`${ev.from}->${ev.to}`);
      if (!s.input.directed) next.add(`${ev.to}->${ev.from}`);
      return { ...s, highlightedEdges: next };
    }
    case 'set_distance': {
      return { ...s, distance: { ...dist, [String(ev.node)]: ev.distance } };
    }
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Tree ───────────────────────────────────────

export interface TreeState {
  root: TreeInputNode;
  nodeState: Record<string, NodeStateName>;
  values: Record<string, string | number>;
  highlightedEdges: Set<string>;
  /** Visit stack (nodes currently between enter/leave). */
  visitStack: string[];
  lastNote?: string;
}

function collectTree(node: TreeInputNode, into: Record<string, NodeStateName>, vals: Record<string, string | number>): void {
  into[String(node.id)] = 'idle';
  if (node.value !== undefined) vals[String(node.id)] = node.value;
  for (const c of node.children ?? []) collectTree(c, into, vals);
}

function treeInitial(root: TreeInput): TreeState {
  const nodeState: Record<string, NodeStateName> = {};
  const values: Record<string, string | number> = {};
  collectTree(root, nodeState, values);
  return { root, nodeState, values, highlightedEdges: new Set(), visitStack: [] };
}

function applyTree(s: TreeState, ev: TreeEvent): TreeState {
  switch (ev.t) {
    case 'enter': {
      const k = String(ev.node);
      return { ...s, nodeState: { ...s.nodeState, [k]: 'visiting' }, visitStack: [...s.visitStack, k] };
    }
    case 'leave': {
      const k = String(ev.node);
      const stack = s.visitStack.filter(x => x !== k);
      return { ...s, nodeState: { ...s.nodeState, [k]: 'visited' }, visitStack: stack };
    }
    case 'visit':
      return { ...s, nodeState: { ...s.nodeState, [String(ev.node)]: 'visiting' } };
    case 'set_state':
      return { ...s, nodeState: { ...s.nodeState, [String(ev.node)]: ev.state } };
    case 'highlight_edge': {
      const next = new Set(s.highlightedEdges);
      next.add(`${ev.from}->${ev.to}`);
      return { ...s, highlightedEdges: next };
    }
    case 'set_value':
      return { ...s, values: { ...s.values, [String(ev.node)]: ev.value } };
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Array sort ─────────────────────────────────

export interface ArraySortState {
  values: number[];
  compare: [number, number] | null;
  swap: [number, number] | null;
  sorted: Set<number>;
  range: [number, number] | null;
  pivot: number | null;
  lastNote?: string;
}

function arrayInitial(input: ArraySortInput): ArraySortState {
  return {
    values: [...input.values],
    compare: null,
    swap: null,
    sorted: new Set(),
    range: null,
    pivot: null,
  };
}

function applyArray(s: ArraySortState, ev: ArraySortEvent): ArraySortState {
  switch (ev.t) {
    case 'compare':
      return { ...s, compare: [ev.i, ev.j], swap: null };
    case 'swap': {
      const v = [...s.values];
      const tmp = v[ev.i];
      v[ev.i] = v[ev.j];
      v[ev.j] = tmp;
      return { ...s, values: v, swap: [ev.i, ev.j], compare: null };
    }
    case 'set': {
      const v = [...s.values];
      v[ev.i] = ev.v;
      return { ...s, values: v };
    }
    case 'mark_sorted': {
      const next = new Set(s.sorted);
      next.add(ev.i);
      return { ...s, sorted: next };
    }
    case 'highlight_range':
      return { ...s, range: [ev.lo, ev.hi] };
    case 'pivot':
      return { ...s, pivot: ev.i };
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Grid ───────────────────────────────────────

export interface GridState {
  rows: number;
  cols: number;
  walls: Set<string>; // "r,c"
  start: [number, number] | null;
  goal: [number, number] | null;
  cellState: Record<string, NodeStateName>;
  values: Record<string, number | string>;
  path: [number, number][] | null;
  lastNote?: string;
}

function gridInitial(input: GridInput): GridState {
  const walls = new Set<string>();
  for (const [r, c] of input.walls ?? []) walls.add(`${r},${c}`);
  const values: Record<string, number | string> = {};
  for (const v of input.values ?? []) values[`${v.r},${v.c}`] = v.v;
  return {
    rows: input.rows,
    cols: input.cols,
    walls,
    start: input.start ?? null,
    goal: input.goal ?? null,
    cellState: {},
    values,
    path: null,
  };
}

function applyGrid(s: GridState, ev: GridEvent): GridState {
  switch (ev.t) {
    case 'visit':
      return { ...s, cellState: { ...s.cellState, [`${ev.r},${ev.c}`]: 'visited' } };
    case 'set_state':
      return { ...s, cellState: { ...s.cellState, [`${ev.r},${ev.c}`]: ev.state } };
    case 'set_value':
      return { ...s, values: { ...s.values, [`${ev.r},${ev.c}`]: ev.v } };
    case 'highlight_path':
      return { ...s, path: ev.path };
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Linked list ────────────────────────────────

interface NormalizedLLNode {
  id: string;
  value: string | number;
  next: string | null;
}

export interface LinkedListState {
  head: string | null;
  nodes: Record<string, NormalizedLLNode>;
  order: string[];
  pointers: Record<string, string | null>; // pointer name → node id
  visiting: string | null;
  lastNote?: string;
}

function normalizeLLNode(n: LinkedListInputNode): NormalizedLLNode {
  return {
    id: String(n.id),
    value: n.value,
    next: n.next == null ? null : String(n.next),
  };
}

function llInitial(input: LinkedListInput): LinkedListState {
  const nodes: Record<string, NormalizedLLNode> = {};
  for (const n of input.nodes) nodes[String(n.id)] = normalizeLLNode(n);
  const order = orderFromHead(input.head == null ? null : String(input.head), nodes);
  return {
    head: input.head == null ? null : String(input.head),
    nodes,
    order,
    pointers: input.head == null ? {} : { head: String(input.head) },
    visiting: null,
  };
}

function orderFromHead(head: string | null, nodes: Record<string, NormalizedLLNode>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let cur = head;
  while (cur && !seen.has(cur) && nodes[cur]) {
    seen.add(cur);
    out.push(cur);
    cur = nodes[cur].next;
  }
  // Append any orphans for visibility.
  for (const id of Object.keys(nodes)) if (!seen.has(id)) out.push(id);
  return out;
}

function applyLinkedList(s: LinkedListState, ev: LinkedListEvent): LinkedListState {
  switch (ev.t) {
    case 'visit':
      return { ...s, visiting: String(ev.node) };
    case 'set_pointer':
      return { ...s, pointers: { ...s.pointers, [ev.name]: ev.node == null ? null : String(ev.node) } };
    case 'set_next': {
      const id = String(ev.node);
      if (!s.nodes[id]) return s;
      const next = ev.target == null ? null : String(ev.target);
      const nodes = { ...s.nodes, [id]: { ...s.nodes[id], next } };
      return { ...s, nodes, order: orderFromHead(s.head, nodes) };
    }
    case 'insert': {
      const newNode = normalizeLLNode(ev.node);
      const nodes = { ...s.nodes, [newNode.id]: newNode };
      let head: string | null = s.head;
      if (ev.after == null) {
        // insert at head
        newNode.next = head;
        head = newNode.id;
      } else {
        const a = String(ev.after);
        if (nodes[a]) {
          newNode.next = nodes[a].next;
          nodes[a] = { ...nodes[a], next: newNode.id };
        }
      }
      return { ...s, head, nodes, order: orderFromHead(head, nodes) };
    }
    case 'delete': {
      const id = String(ev.node);
      const nodes = { ...s.nodes };
      // Detach any nodes pointing to it.
      for (const key of Object.keys(nodes)) {
        if (nodes[key].next === id) nodes[key] = { ...nodes[key], next: nodes[id]?.next ?? null };
      }
      let head: string | null = s.head;
      if (head === id) head = nodes[id]?.next ?? null;
      delete nodes[id];
      return { ...s, head, nodes, order: orderFromHead(head, nodes) };
    }
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Recursion ──────────────────────────────────

export interface RecursionFrame {
  id: number;
  parent: number | null;
  fn: string;
  args: string;
  value?: string;
  returned: boolean;
  highlighted: boolean;
}

export interface RecursionState {
  frames: Record<number, RecursionFrame>;
  order: number[];
  highlight: number | null;
  lastNote?: string;
}

function recursionInitial(): RecursionState {
  return { frames: {}, order: [], highlight: null };
}

function applyRecursion(s: RecursionState, ev: RecursionEvent): RecursionState {
  switch (ev.t) {
    case 'call': {
      const frame: RecursionFrame = { id: ev.id, parent: ev.parent, fn: ev.fn, args: ev.args, returned: false, highlighted: false };
      return { ...s, frames: { ...s.frames, [ev.id]: frame }, order: [...s.order, ev.id], highlight: ev.id };
    }
    case 'return': {
      const f = s.frames[ev.id];
      if (!f) return s;
      return {
        ...s,
        frames: { ...s.frames, [ev.id]: { ...f, value: ev.value, returned: true } },
        highlight: f.parent ?? s.highlight,
      };
    }
    case 'highlight':
      return { ...s, highlight: ev.id };
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Stack/Queue ────────────────────────────────

export interface StackQueueState {
  stack: (string | number)[];
  queue: (string | number)[];
  show: ('stack' | 'queue')[];
  flash: { struct: 'stack' | 'queue'; end: 'top' | 'front' | 'back' } | null;
  lastNote?: string;
}

function sqInitial(input: StackQueueInput): StackQueueState {
  return { stack: [], queue: [], show: input.show ?? ['stack', 'queue'], flash: null };
}

function applyStackQueue(s: StackQueueState, ev: StackQueueEvent): StackQueueState {
  switch (ev.t) {
    case 'push':
      return { ...s, stack: [...s.stack, ev.value], flash: { struct: 'stack', end: 'top' } };
    case 'pop':
      return { ...s, stack: s.stack.slice(0, -1), flash: { struct: 'stack', end: 'top' } };
    case 'enqueue':
      return { ...s, queue: [...s.queue, ev.value], flash: { struct: 'queue', end: 'back' } };
    case 'dequeue':
      return { ...s, queue: s.queue.slice(1), flash: { struct: 'queue', end: 'front' } };
    case 'peek':
      return { ...s, flash: { struct: ev.struct, end: ev.struct === 'stack' ? 'top' : 'front' } };
    case 'note':
      return { ...s, lastNote: ev.text };
    default:
      return s;
  }
}

// ───────────────────────── Public API ─────────────────────────────────

export type AnyVizState =
  | GraphState | TreeState | ArraySortState | GridState
  | LinkedListState | RecursionState | StackQueueState;

export function initialState(plan: VizPlan): AnyVizState {
  switch (plan.input.category) {
    case 'graph':               return graphInitial(plan.input.data);
    case 'tree':                return treeInitial(plan.input.data);
    case 'array_sort':          return arrayInitial(plan.input.data);
    case 'grid':                return gridInitial(plan.input.data);
    case 'linked_list':         return llInitial(plan.input.data);
    case 'recursion_call_tree': return recursionInitial();
    case 'stack_queue':         return sqInitial(plan.input.data);
  }
}

export function applyEvent(plan: VizPlan, state: AnyVizState, ev: VizEvent): AnyVizState {
  switch (plan.input.category) {
    case 'graph':               return applyGraph(state as GraphState, ev as GraphEvent);
    case 'tree':                return applyTree(state as TreeState, ev as TreeEvent);
    case 'array_sort':          return applyArray(state as ArraySortState, ev as ArraySortEvent);
    case 'grid':                return applyGrid(state as GridState, ev as GridEvent);
    case 'linked_list':         return applyLinkedList(state as LinkedListState, ev as LinkedListEvent);
    case 'recursion_call_tree': return applyRecursion(state as RecursionState, ev as RecursionEvent);
    case 'stack_queue':         return applyStackQueue(state as StackQueueState, ev as StackQueueEvent);
  }
}

/**
 * Compute the cumulative state after `step` events have been applied.
 * `step === 0` means the initial state.
 */
export function stateAt(plan: VizPlan, events: VizEvent[], step: number): AnyVizState {
  let s = initialState(plan);
  const cap = Math.min(step, events.length);
  for (let i = 0; i < cap; i++) s = applyEvent(plan, s, events[i]);
  return s;
}
