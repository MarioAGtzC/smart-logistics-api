import { MinHeap } from './min-heap';
import { Edge } from './types';

export interface LegResult {
  path: string[];
  cost: number;
}

/** Cheapest path on a directed graph with non-negative costs, or null if unreachable. */
export function dijkstra(
  edges: Edge[],
  origin: string,
  destination: string,
): LegResult | null {
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const best = new Map<string, number>([[origin, 0]]);
  const previous = new Map<string, string>();
  const queue = new MinHeap<string>();
  queue.push(origin, 0);

  for (let node = queue.pop(); node !== undefined; node = queue.pop()) {
    if (node === destination) {
      return {
        path: rebuildPath(previous, destination),
        cost: best.get(node)!,
      };
    }
    const cost = best.get(node)!;
    for (const edge of outgoing.get(node) ?? []) {
      const candidate = cost + edge.cost;
      if (candidate < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, candidate);
        previous.set(edge.to, node);
        // Stale heap entries for edge.to are left in place; they pop later and relax nothing.
        queue.push(edge.to, candidate);
      }
    }
  }
  return null;
}

function rebuildPath(previous: Map<string, string>, destination: string) {
  const path = [destination];
  for (
    let node = previous.get(destination);
    node !== undefined;
    node = previous.get(node)
  ) {
    path.unshift(node);
  }
  return path;
}
