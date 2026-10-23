import { findRoute } from './find-route';
import { Edge, RouteRequest, VehicleProfile } from './types';

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
): RouteRequest => ({
  originNodeId,
  destinationNodeId,
  vehicleProfile,
  departureTime: '12:00',
});

describe('findRoute (vehicle constraints and errors)', () => {
  it('README case 1: light van takes A -> C -> D -> E (30)', () => {
    expect(
      findRoute(
        graph,
        request({ type: 'van', weight: 3000, hazardous: false }),
      ),
    ).toEqual({ path: ['A', 'C', 'D', 'E'], totalCost: 30 });
  });

  it('README case 2: a 6000 truck is too heavy for A->C and C->D', () => {
    expect(
      findRoute(
        graph,
        request({ type: 'truck', weight: 6000, hazardous: false }),
      ),
    ).toEqual({ path: ['A', 'B', 'D', 'E'], totalCost: 32 });
  });

  it('README case 3: hazardous load cannot use noHazardous edges', () => {
    expect(
      findRoute(
        graph,
        request({ type: 'truck', weight: 3000, hazardous: true }),
      ),
    ).toEqual({ path: ['A', 'B', 'D', 'E'], totalCost: 32 });
  });

  it('allows a vehicle that weighs exactly maxWeight', () => {
    expect(
      findRoute(
        graph,
        request({ type: 'truck', weight: 5000, hazardous: false }),
      ),
    ).toEqual({ path: ['A', 'C', 'D', 'E'], totalCost: 30 });
  });

  it('filters nothing when there is no vehicle profile', () => {
    const onlyRestricted: Edge[] = [
      { from: 'A', to: 'E', cost: 1, maxWeight: 1, noHazardous: true },
    ];
    expect(findRoute(onlyRestricted, request())).toEqual({
      path: ['A', 'E'],
      totalCost: 1,
    });
  });

  const errorOf = (outcome: ReturnType<typeof findRoute>) =>
    'error' in outcome ? outcome.error : undefined;

  it('INVALID_NODE when the origin is not in the graph', () => {
    const error = errorOf(findRoute(graph, request(undefined, 'Z', 'E')));
    expect(error?.code).toBe('INVALID_NODE');
    expect(error?.message).toContain('"Z"');
  });

  it('INVALID_NODE when the destination is not in the graph', () => {
    const error = errorOf(findRoute(graph, request(undefined, 'A', 'Z')));
    expect(error?.code).toBe('INVALID_NODE');
    expect(error?.message).toContain('"Z"');
  });

  it('NO_ROUTE when no path exists even without constraints', () => {
    expect(errorOf(findRoute(graph, request(undefined, 'E', 'A')))?.code).toBe(
      'NO_ROUTE',
    );
  });

  it('ROUTE_BLOCKED_BY_CONSTRAINTS when only the vehicle prevents the route', () => {
    // D->E (maxWeight 8000) is on every route, so a 9000 truck cannot arrive.
    const outcome = findRoute(
      graph,
      request({ type: 'truck', weight: 9000, hazardous: false }),
    );
    expect(errorOf(outcome)?.code).toBe('ROUTE_BLOCKED_BY_CONSTRAINTS');
  });
});
