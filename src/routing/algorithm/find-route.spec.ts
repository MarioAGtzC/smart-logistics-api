import { findRoute } from './find-route';
import { parsePeakHours } from './peak-hours';
import { Edge, RouteRequest, VehicleProfile } from './types';

const peak = parsePeakHours('07:00-09:00,17:00-19:00');
const route = (edges: Edge[], req: RouteRequest) => findRoute(edges, req, peak);

// Validation graph from the README.
const graph: Edge[] = [
  {
    from: 'A',
    to: 'B',
    cost: 10,
    maxWeight: 10000,
    noHazardous: false,
    trafficMultiplier: 1.0,
  },
  {
    from: 'A',
    to: 'C',
    cost: 15,
    maxWeight: 5000,
    noHazardous: true,
    trafficMultiplier: 1.5,
  },
  {
    from: 'B',
    to: 'D',
    cost: 12,
    maxWeight: 10000,
    noHazardous: false,
    trafficMultiplier: 2.0,
  },
  {
    from: 'C',
    to: 'D',
    cost: 5,
    maxWeight: 5000,
    noHazardous: true,
    trafficMultiplier: 1.0,
  },
  {
    from: 'D',
    to: 'E',
    cost: 10,
    maxWeight: 8000,
    noHazardous: false,
    trafficMultiplier: 1.2,
  },
];

const request = (
  vehicleProfile?: VehicleProfile,
  originNodeId = 'A',
  destinationNodeId = 'E',
  departureTime = '12:00',
): RouteRequest => ({
  originNodeId,
  destinationNodeId,
  vehicleProfile,
  departureTime,
});

describe('findRoute (vehicle constraints and errors)', () => {
  it('README case 1: light van takes A -> C -> D -> E (30)', () => {
    expect(
      route(graph, request({ type: 'van', weight: 3000, hazardous: false })),
    ).toEqual({ path: ['A', 'C', 'D', 'E'], totalCost: 30 });
  });

  it('README case 2: a 6000 truck is too heavy for A->C and C->D', () => {
    expect(
      route(graph, request({ type: 'truck', weight: 6000, hazardous: false })),
    ).toEqual({ path: ['A', 'B', 'D', 'E'], totalCost: 32 });
  });

  it('README case 3: hazardous load cannot use noHazardous edges', () => {
    expect(
      route(graph, request({ type: 'truck', weight: 3000, hazardous: true })),
    ).toEqual({ path: ['A', 'B', 'D', 'E'], totalCost: 32 });
  });

  it('allows a vehicle that weighs exactly maxWeight', () => {
    expect(
      route(graph, request({ type: 'truck', weight: 5000, hazardous: false })),
    ).toEqual({ path: ['A', 'C', 'D', 'E'], totalCost: 30 });
  });

  it('filters nothing when there is no vehicle profile', () => {
    const onlyRestricted: Edge[] = [
      { from: 'A', to: 'E', cost: 1, maxWeight: 1, noHazardous: true },
    ];
    expect(route(onlyRestricted, request())).toEqual({
      path: ['A', 'E'],
      totalCost: 1,
    });
  });

  const errorOf = (outcome: ReturnType<typeof findRoute>) =>
    'error' in outcome ? outcome.error : undefined;

  it('INVALID_NODE when the origin is not in the graph', () => {
    const error = errorOf(route(graph, request(undefined, 'Z', 'E')));
    expect(error?.code).toBe('INVALID_NODE');
    expect(error?.message).toContain('"Z"');
  });

  it('INVALID_NODE when the destination is not in the graph', () => {
    const error = errorOf(route(graph, request(undefined, 'A', 'Z')));
    expect(error?.code).toBe('INVALID_NODE');
    expect(error?.message).toContain('"Z"');
  });

  it('NO_ROUTE when no path exists even without constraints', () => {
    expect(errorOf(route(graph, request(undefined, 'E', 'A')))?.code).toBe(
      'NO_ROUTE',
    );
  });

  it('ROUTE_BLOCKED_BY_CONSTRAINTS when only the vehicle prevents the route', () => {
    // D->E (maxWeight 8000) is on every route, so a 9000 truck cannot arrive.
    const outcome = route(
      graph,
      request({ type: 'truck', weight: 9000, hazardous: false }),
    );
    expect(errorOf(outcome)?.code).toBe('ROUTE_BLOCKED_BY_CONSTRAINTS');
  });
});

describe('findRoute (time-dependent peak-hour costs)', () => {
  const at = (departureTime: string): RouteRequest =>
    request(undefined, 'A', 'E', departureTime);

  it('agreed example: departing 06:50, the multiplier depends on the edge entry time', () => {
    // A->C entered 06:50 (off-peak) = 15 -> 07:05; C->D entered 07:05 = 5 x 1.0 -> 07:10;
    // D->E entered 07:10 = 10 x 1.2 = 12 -> 07:22. The B route would cost 10 + 24 + 12 = 46.
    expect(route(graph, at('06:50'))).toEqual({
      path: ['A', 'C', 'D', 'E'],
      totalCost: 32,
    });
  });

  it('README graph keeps A -> C -> D -> E at 08:00 (39.5 vs 46 via B)', () => {
    expect(route(graph, at('08:00'))).toEqual({
      path: ['A', 'C', 'D', 'E'],
      totalCost: 39.5,
    });
  });

  it('a peak departure changes the chosen route', () => {
    const congestedShortcut: Edge[] = [
      { from: 'A', to: 'B', cost: 10, trafficMultiplier: 3 },
      { from: 'B', to: 'E', cost: 1 },
      { from: 'A', to: 'C', cost: 12 },
      { from: 'C', to: 'E', cost: 1 },
    ];
    expect(route(congestedShortcut, at('12:00'))).toEqual({
      path: ['A', 'B', 'E'],
      totalCost: 11,
    });
    expect(route(congestedShortcut, at('08:00'))).toEqual({
      path: ['A', 'C', 'E'],
      totalCost: 13,
    });
  });

  it('does not model waiting: entering just before peak ends pays the full multiplier', () => {
    // Known limitation: waiting until 09:00 would cost 5 + 20 = 25, but vehicles never wait.
    const lastMinutes: Edge[] = [
      { from: 'A', to: 'E', cost: 20, trafficMultiplier: 2 },
    ];
    expect(route(lastMinutes, at('08:55'))).toEqual({
      path: ['A', 'E'],
      totalCost: 40,
    });
  });

  it('keeps the clock right across midnight', () => {
    // A->B entered 23:50 = 15 -> 00:05; B->E entered 00:05 falls in 00:00-01:00, so 10 x 2.
    const lateGraph: Edge[] = [
      { from: 'A', to: 'B', cost: 15 },
      { from: 'B', to: 'E', cost: 10, trafficMultiplier: 2 },
    ];
    expect(
      findRoute(lateGraph, at('23:50'), parsePeakHours('00:00-01:00')),
    ).toEqual({ path: ['A', 'B', 'E'], totalCost: 35 });
  });
});
