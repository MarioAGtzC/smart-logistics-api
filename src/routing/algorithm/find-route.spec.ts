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
    ).toMatchObject({ path: ['A', 'C', 'D', 'E'], totalCost: 30 });
  });

  it('README case 2: a 6000 truck is too heavy for A->C and C->D', () => {
    expect(
      route(graph, request({ type: 'truck', weight: 6000, hazardous: false })),
    ).toMatchObject({ path: ['A', 'B', 'D', 'E'], totalCost: 32 });
  });

  it('README case 3: hazardous load cannot use noHazardous edges', () => {
    expect(
      route(graph, request({ type: 'truck', weight: 3000, hazardous: true })),
    ).toMatchObject({ path: ['A', 'B', 'D', 'E'], totalCost: 32 });
  });

  it('allows a vehicle that weighs exactly maxWeight', () => {
    expect(
      route(graph, request({ type: 'truck', weight: 5000, hazardous: false })),
    ).toMatchObject({ path: ['A', 'C', 'D', 'E'], totalCost: 30 });
  });

  it('filters nothing when there is no vehicle profile', () => {
    const onlyRestricted: Edge[] = [
      { from: 'A', to: 'E', cost: 1, maxWeight: 1, noHazardous: true },
    ];
    expect(route(onlyRestricted, request())).toMatchObject({
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
    expect(route(graph, at('06:50'))).toMatchObject({
      path: ['A', 'C', 'D', 'E'],
      totalCost: 32,
      arrivalTime: '07:22',
    });
  });

  it('README graph keeps A -> C -> D -> E at 08:00 (39.5 vs 46 via B)', () => {
    expect(route(graph, at('08:00'))).toMatchObject({
      path: ['A', 'C', 'D', 'E'],
      totalCost: 39.5,
      arrivalTime: '08:40', // 08:39.5 rounded to the nearest minute
    });
  });

  it('a peak departure changes the chosen route', () => {
    const congestedShortcut: Edge[] = [
      { from: 'A', to: 'B', cost: 10, trafficMultiplier: 3 },
      { from: 'B', to: 'E', cost: 1 },
      { from: 'A', to: 'C', cost: 12 },
      { from: 'C', to: 'E', cost: 1 },
    ];
    expect(route(congestedShortcut, at('12:00'))).toMatchObject({
      path: ['A', 'B', 'E'],
      totalCost: 11,
    });
    expect(route(congestedShortcut, at('08:00'))).toMatchObject({
      path: ['A', 'C', 'E'],
      totalCost: 13,
    });
  });

  it('does not model waiting: entering just before peak ends pays the full multiplier', () => {
    // Known limitation: waiting until 09:00 would cost 5 + 20 = 25, but vehicles never wait.
    const lastMinutes: Edge[] = [
      { from: 'A', to: 'E', cost: 20, trafficMultiplier: 2 },
    ];
    expect(route(lastMinutes, at('08:55'))).toMatchObject({
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
    ).toMatchObject({
      path: ['A', 'B', 'E'],
      totalCost: 35,
      arrivalTime: '00:25',
    });
  });
});

describe('findRoute (multi-stop waypoints)', () => {
  const withStops = (
    waypoints: string[],
    overrides: Partial<RouteRequest> = {},
  ): RouteRequest => ({
    ...request(undefined, 'A', 'E'),
    waypoints,
    ...overrides,
  });

  it('visits waypoint B even though A -> C -> D -> E is cheaper', () => {
    expect(route(graph, withStops(['B']))).toEqual({
      path: ['A', 'B', 'D', 'E'],
      totalCost: 32,
      arrivalTime: '12:32',
    });
  });

  it('visits waypoints in the given order (nodes may repeat in the path)', () => {
    const square: Edge[] = [
      { from: 'A', to: 'B', cost: 1 },
      { from: 'B', to: 'C', cost: 1 },
      { from: 'C', to: 'B', cost: 1 },
      { from: 'B', to: 'E', cost: 10 },
      { from: 'C', to: 'E', cost: 1 },
    ];
    expect(route(square, withStops(['B', 'C']))).toMatchObject({
      path: ['A', 'B', 'C', 'E'],
      totalCost: 3,
    });
    // C first (A->B->C), then back to B (C->B), then the cheapest B->E is B->C->E.
    expect(route(square, withStops(['C', 'B']))).toMatchObject({
      path: ['A', 'B', 'C', 'B', 'C', 'E'],
      totalCost: 5,
    });
  });

  it('does not duplicate nodes for a repeated waypoint', () => {
    expect(route(graph, withStops(['B', 'B']))).toMatchObject({
      path: ['A', 'B', 'D', 'E'],
      totalCost: 32,
    });
  });

  it('carries the clock between legs into peak hours', () => {
    // Leg A->B: 20 off-peak, 06:50 -> 07:10. Leg B->E starts at 07:10 (peak): 10 x 2 = 20.
    // Restarting the clock at 06:50 for the second leg would wrongly give 10.
    const twoLegs: Edge[] = [
      { from: 'A', to: 'B', cost: 20 },
      { from: 'B', to: 'E', cost: 10, trafficMultiplier: 2 },
    ];
    expect(
      route(twoLegs, withStops(['B'], { departureTime: '06:50' })),
    ).toEqual({ path: ['A', 'B', 'E'], totalCost: 40, arrivalTime: '07:30' });
  });

  const errorOf = (outcome: ReturnType<typeof findRoute>) =>
    'error' in outcome ? outcome.error : undefined;

  it('INVALID_NODE for a waypoint that is not in the graph', () => {
    const error = errorOf(route(graph, withStops(['Z'])));
    expect(error?.code).toBe('INVALID_NODE');
    expect(error?.message).toContain('"Z"');
  });

  it('NO_ROUTE for an unreachable waypoint, naming the failing leg', () => {
    // B cannot reach C: the leg B -> C fails.
    const error = errorOf(
      route(graph, withStops(['C'], { originNodeId: 'B' })),
    );
    expect(error?.code).toBe('NO_ROUTE');
    expect(error?.message).toContain('from B to C');
  });

  it('ROUTE_BLOCKED_BY_CONSTRAINTS when only the vehicle blocks a leg', () => {
    // A -> C exists only through edges limited to 5000.
    const error = errorOf(
      route(
        graph,
        withStops(['C'], {
          vehicleProfile: { type: 'truck', weight: 6000, hazardous: false },
        }),
      ),
    );
    expect(error?.code).toBe('ROUTE_BLOCKED_BY_CONSTRAINTS');
    expect(error?.message).toContain('from A to C');
  });
});
