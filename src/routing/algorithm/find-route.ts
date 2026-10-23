import { canTraverse } from './constraints';
import { dijkstra, EdgeWeight } from './dijkstra';
import { isPeak, parseClock, PeakWindow } from './peak-hours';
import { Edge, RouteError, RouteRequest } from './types';

export type FindRouteOutcome =
  { path: string[]; totalCost: number } | { error: RouteError };

export function findRoute(
  edges: Edge[],
  request: RouteRequest,
  peakWindows: PeakWindow[],
): FindRouteOutcome {
  const { originNodeId: origin, destinationNodeId: destination } = request;
  const departure = parseClock(request.departureTime);
  // The multiplier applies only if the vehicle enters the edge during a peak window.
  const weight: EdgeWeight = (edge, enteredAt) =>
    isPeak(enteredAt, peakWindows)
      ? edge.cost * (edge.trafficMultiplier ?? 1)
      : edge.cost;

  const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const unknown = [origin, destination].find((node) => !nodes.has(node));
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
  const leg = dijkstra(allowed, origin, destination, weight, departure);
  if (leg) return { path: leg.path, totalCost: leg.cost };

  // Only on failure: rerun without constraints to tell the two errors apart.
  if (
    allowed.length < edges.length &&
    dijkstra(edges, origin, destination, weight, departure)
  ) {
    return {
      error: {
        code: 'ROUTE_BLOCKED_BY_CONSTRAINTS',
        message: `No route from ${origin} to ${destination} for this vehicle (weight or hazardous-load restrictions)`,
      },
    };
  }
  return {
    error: {
      code: 'NO_ROUTE',
      message: `No route from ${origin} to ${destination}`,
    },
  };
}
