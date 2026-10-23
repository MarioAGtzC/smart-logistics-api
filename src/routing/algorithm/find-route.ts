import { canTraverse } from './constraints';
import { dijkstra, EdgeWeight } from './dijkstra';
import { formatClock, isPeak, parseClock, PeakWindow } from './peak-hours';
import { Edge, RouteError, RouteRequest } from './types';

export type FindRouteOutcome =
  | { path: string[]; totalCost: number; arrivalTime: string }
  | { error: RouteError };

/** Visits origin, each waypoint in order, then destination, one Dijkstra leg per hop. */
export function findRoute(
  edges: Edge[],
  request: RouteRequest,
  peakWindows: PeakWindow[],
): FindRouteOutcome {
  const stops = [
    request.originNodeId,
    ...(request.waypoints ?? []),
    request.destinationNodeId,
  ];
  // The multiplier applies only if the vehicle enters the edge during a peak window.
  const weight: EdgeWeight = (edge, enteredAt) =>
    isPeak(enteredAt, peakWindows)
      ? edge.cost * (edge.trafficMultiplier ?? 1)
      : edge.cost;

  const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const unknown = stops.find((node) => !nodes.has(node));
  if (unknown !== undefined) {
    return {
      error: {
        code: 'INVALID_NODE',
        message: `Node "${unknown}" does not exist in this graph`,
      },
    };
  }

  const allowed = edges.filter((edge) =>
    canTraverse(edge, request.vehicleProfile),
  );
  const departure = parseClock(request.departureTime);
  let clock = departure;
  const path = [stops[0]];

  for (let i = 1; i < stops.length; i++) {
    const [from, to] = [stops[i - 1], stops[i]];
    const leg = dijkstra(allowed, from, to, weight, clock);
    if (!leg) {
      return { error: legError(edges, allowed, from, to, weight, clock) };
    }
    // Each leg starts where the previous one ended; skip the shared node.
    path.push(...leg.path.slice(1));
    clock += leg.cost;
  }

  return {
    path,
    totalCost: clock - departure,
    arrivalTime: formatClock(clock),
  };
}

function legError(
  edges: Edge[],
  allowed: Edge[],
  from: string,
  to: string,
  weight: EdgeWeight,
  clock: number,
): RouteError {
  // Only on failure: rerun without constraints to tell the two errors apart.
  if (
    allowed.length < edges.length &&
    dijkstra(edges, from, to, weight, clock)
  ) {
    return {
      code: 'ROUTE_BLOCKED_BY_CONSTRAINTS',
      message: `No route from ${from} to ${to} for this vehicle (weight or hazardous-load restrictions)`,
    };
  }
  return { code: 'NO_ROUTE', message: `No route from ${from} to ${to}` };
}
