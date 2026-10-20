/**
 * Dependency graph over `EngDocument.values` (Task 5).
 *
 * Builds one directed edge `sourceValueId -> targetValueId` for every
 * `ResolvedSymbolRef` on every value's `ResolvedExpression.symbolRefs`
 * (Task 4 has already resolved every ref it could; an unresolved symbol
 * never made it into `symbolRefs` in the first place, so there is nothing
 * to filter here). A `var`/`input`/`decision` bound to a literal (no
 * `expression`) is still a graph node — just one with no outgoing edges.
 *
 * Cycles are detected with Tarjan's strongly-connected-components
 * algorithm (iterative, not recursive, so a long dependency chain can't
 * blow the call stack). A self-edge (`a` depends on `a`) is a 1-node
 * cyclic SCC. One `CALC_CYCLE` diagnostic is emitted per cyclic SCC, never
 * per edge or per node.
 *
 * Tarjan's algorithm has a useful side effect this module leans on: the
 * sequence of SCCs it outputs is always a valid reverse-topological order
 * of the whole condensation graph — for every edge `a -> b` with `a` and
 * `b` in different SCCs, SCC(b) is emitted before SCC(a). Since our edges
 * mean "a depends on b", that's exactly dependency-first order. So the
 * topological order is just "every non-cyclic (singleton, no self-loop)
 * SCC, in the order Tarjan emitted them" — no separate topo-sort pass is
 * needed, and values downstream of a cycle (which are their own singleton
 * SCCs, just with an edge into the excluded cyclic SCC) fall out of that
 * same sequence automatically.
 *
 * Determinism: every place iteration order would otherwise depend on a
 * `Map`/`Set`, this module instead walks a pre-sorted `string[]` of value
 * IDs, ordered by (source-order rank of the owning `SemanticNode`, then
 * value ID lexicographically) — see `compareValueIds` below. Per-value
 * dependency lists preserve `symbolRefs` order (already deterministic,
 * derived from the expression's own token order, not from Map iteration).
 *
 * ## Output shape (consumed directly by Task 6)
 *
 * - `order: string[]` — topological order (dependencies before
 *   dependents), excluding ONLY values that are themselves members of a
 *   cycle. Values downstream of a cycle remain, so Task 6 can walk them in
 *   order and emit `UPSTREAM_ERROR` when it hits a broken dependency.
 * - `dependencies: Map<string, string[]>` — every graph node's direct
 *   dependency value IDs (deduped, deterministic order). Every key in
 *   `EngDocument.values` has an entry here, even if empty.
 * - `dependents: Map<string, string[]>` — reverse edges: for each value
 *   ID, the value IDs whose expression directly references it.
 * - `cyclicValueIds: Set<string>` — every value that is a member of some
 *   cyclic SCC (self-loops included).
 * - `cycles: string[][]` — one closed path per cyclic SCC (starts and
 *   ends with the same value ID), in the same dependency-first order as
 *   `order`/diagnostics. For an SCC with extra chords beyond a single
 *   minimal cycle, this is a witness cycle through the SCC's canonical
 *   start node (lowest rank/id member), not necessarily every member —
 *   the full member set is also available via `cyclicValueIds` and in each
 *   `CALC_CYCLE` diagnostic's `details.members`.
 * - `diagnostics: Diagnostic[]` — `CALC_CYCLE` (one per cyclic SCC) and/or
 *   `LIMIT_EXCEEDED` (node/edge count limits; see `GRAPH_LIMITS` below).
 */

import type { EngDocument } from '../model/document.js';
import type { Diagnostic } from '../model/diagnostics.js';

/**
 * Graph resource limits. Conservative defaults for a reference
 * implementation, following the same "single exported config, no inline
 * magic numbers" convention as `PARSE_LIMITS` (Task 2) and the engine
 * limits (Task 3). See `engdoc/NOTES.md` ("Task 5") for rationale.
 */
export interface GraphLimits {
  /** Max entries in `EngDocument.values` this module will build a graph over. */
  maxGraphNodes: number;
  /** Max total dependency edges (post-dedup) across the whole graph. */
  maxGraphEdges: number;
}

export const GRAPH_LIMITS: GraphLimits = {
  maxGraphNodes: 5_000,
  maxGraphEdges: 25_000,
};

export interface ValueGraph {
  order: string[];
  dependencies: Map<string, string[]>;
  dependents: Map<string, string[]>;
  cyclicValueIds: Set<string>;
  cycles: string[][];
  diagnostics: Diagnostic[];
}

function emptyGraph(diagnostics: Diagnostic[]): ValueGraph {
  return {
    order: [],
    dependencies: new Map(),
    dependents: new Map(),
    cyclicValueIds: new Set(),
    cycles: [],
    diagnostics,
  };
}

function limitExceeded(limit: string, value: number, max: number): Diagnostic {
  return {
    code: 'LIMIT_EXCEEDED',
    severity: 'error',
    message: `Dependency graph exceeds ${limit} (${value} > ${max}).`,
    details: { limit, value, max },
  };
}

export function buildValueGraph(doc: EngDocument, limits: GraphLimits = GRAPH_LIMITS): ValueGraph {
  const nodeCount = doc.values.size;
  if (nodeCount > limits.maxGraphNodes) {
    return emptyGraph([limitExceeded('maxGraphNodes', nodeCount, limits.maxGraphNodes)]);
  }

  // Source-order rank per value, via its owning SemanticNode's index in
  // `doc.nodes`. Falls back to +Infinity (sorts last) if a binding's
  // `ownerNodeId` somehow doesn't resolve — shouldn't happen for a
  // well-formed EngDocument, but keeps the comparator total either way.
  const nodeRank = new Map<string, number>();
  doc.nodes.forEach((node, i) => nodeRank.set(node.id, i));
  const rankOf = (valueId: string): number => {
    const binding = doc.values.get(valueId);
    if (!binding) return Number.POSITIVE_INFINITY;
    return nodeRank.get(binding.ownerNodeId) ?? Number.POSITIVE_INFINITY;
  };
  const compareValueIds = (a: string, b: string): number => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  const valueIds = Array.from(doc.values.keys()).sort(compareValueIds);

  // Build deduped, order-preserving adjacency (dependencies) and reverse
  // (dependents) maps.
  const dependencies = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const id of valueIds) {
    dependencies.set(id, []);
    dependents.set(id, []);
  }

  let edgeCount = 0;
  for (const id of valueIds) {
    const binding = doc.values.get(id)!;
    const expr = binding.expression;
    if (!expr) continue;
    const seen = new Set<string>();
    const deps: string[] = [];
    for (const ref of expr.symbolRefs) {
      const target = ref.targetValueId;
      if (seen.has(target)) continue;
      seen.add(target);
      deps.push(target);
      edgeCount++;
      if (edgeCount > limits.maxGraphEdges) {
        return emptyGraph([limitExceeded('maxGraphEdges', edgeCount, limits.maxGraphEdges)]);
      }
    }
    // Sort by (source-rank, value ID) rather than keeping raw symbolRefs
    // (token-appearance) order: this list drives both the public
    // `dependencies` map AND Tarjan's DFS traversal order below, so an
    // unsorted list would let DFS-discovery order (which can contradict
    // the documented rank-then-ID tie-break) leak into `order`/`cycles`.
    deps.sort(compareValueIds);
    dependencies.set(id, deps);
    for (const target of deps) {
      dependents.get(target)?.push(id);
    }
  }

  const sccs = tarjanSCC(valueIds, dependencies);

  const order: string[] = [];
  const cyclicValueIds = new Set<string>();
  const cycles: string[][] = [];
  const diagnostics: Diagnostic[] = [];

  for (const scc of sccs) {
    const first = scc[0]!;
    const isSelfLoop = scc.length === 1 && (dependencies.get(first) ?? []).includes(first);
    const isCyclic = scc.length > 1 || isSelfLoop;
    if (!isCyclic) {
      order.push(first);
      continue;
    }
    for (const id of scc) cyclicValueIds.add(id);
    const members = new Set(scc);
    const start = [...scc].sort(compareValueIds)[0]!;
    const path = findCyclePath(start, members, dependencies);
    cycles.push(path);
    const binding = doc.values.get(start);
    diagnostics.push({
      code: 'CALC_CYCLE',
      severity: 'error',
      ...(binding ? { nodeId: binding.ownerNodeId } : {}),
      message: `Circular dependency detected: ${path.join(' -> ')}.`,
      details: { path, members: [...scc].sort(compareValueIds) },
    });
  }

  return { order, dependencies, dependents, cyclicValueIds, cycles, diagnostics };
}

/**
 * Iterative Tarjan's SCC algorithm. Returns SCCs in the algorithm's natural
 * emission order, which is a valid reverse-topological order of the
 * condensation graph (see module doc comment). `nodeIds` and each
 * `adjacency` list must already be in the desired deterministic order —
 * this function only ever iterates them in the order given.
 */
function tarjanSCC(nodeIds: string[], adjacency: Map<string, string[]>): string[][] {
  const indexOf = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let nextIndex = 0;

  interface Frame {
    node: string;
    iter: number;
  }

  for (const root of nodeIds) {
    if (indexOf.has(root)) continue;

    const work: Frame[] = [{ node: root, iter: 0 }];
    indexOf.set(root, nextIndex);
    lowlink.set(root, nextIndex);
    nextIndex++;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const neighbors = adjacency.get(frame.node) ?? [];
      if (frame.iter < neighbors.length) {
        const next = neighbors[frame.iter]!;
        frame.iter++;
        if (!indexOf.has(next)) {
          indexOf.set(next, nextIndex);
          lowlink.set(next, nextIndex);
          nextIndex++;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, iter: 0 });
        } else if (onStack.has(next)) {
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node)!, indexOf.get(next)!));
        }
      } else {
        work.pop();
        const parent = work[work.length - 1];
        if (parent) {
          lowlink.set(parent.node, Math.min(lowlink.get(parent.node)!, lowlink.get(frame.node)!));
        }
        if (lowlink.get(frame.node) === indexOf.get(frame.node)) {
          const scc: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
          } while (w !== frame.node);
          sccs.push(scc);
        }
      }
    }
  }

  return sccs;
}

/**
 * Finds a closed path (shortest, by edge count) starting and ending at
 * `start`, using only edges whose target is also in `members`. `members`
 * is a cyclic SCC, so such a path always exists (a self-loop is handled as
 * a special case). BFS guarantees termination and, given deterministic
 * adjacency order, a deterministic result.
 */
function findCyclePath(start: string, members: Set<string>, dependencies: Map<string, string[]>): string[] {
  if ((dependencies.get(start) ?? []).includes(start)) {
    return [start, start];
  }

  const predecessor = new Map<string, string>();
  const visited = new Set<string>([start]);
  const queue: string[] = [start];

  while (queue.length > 0) {
    const node = queue.shift()!;
    const neighbors = (dependencies.get(node) ?? []).filter((n) => members.has(n));
    for (const next of neighbors) {
      if (next === start) {
        const reversed: string[] = [];
        let cur = node;
        while (cur !== start) {
          reversed.push(cur);
          cur = predecessor.get(cur)!;
        }
        reversed.reverse();
        return [start, ...reversed, start];
      }
      if (!visited.has(next)) {
        visited.add(next);
        predecessor.set(next, node);
        queue.push(next);
      }
    }
  }

  // Unreachable: `members` is a strongly-connected component, so every
  // member has a path back to every other member, including `start`.
  throw new Error(`internal error: no cycle path found through SCC member ${JSON.stringify(start)}`);
}
