import { dijkstra } from './dijkstra';
import { Edge } from './types';

// Validation graph from the README.
const readmeGraph: Edge[] = [
  { from: 'A', to: 'B', cost: 10 },
  { from: 'A', to: 'C', cost: 15 },
  { from: 'B', to: 'D', cost: 12 },
  { from: 'C', to: 'D', cost: 5 },
  { from: 'D', to: 'E', cost: 10 },
];

// Graph from docs/resources/dijkstras-image.jpeg, following its arrows.
const imageGraph: Edge[] = [
  { from: '1', to: '2', cost: 8 },
  { from: '1', to: '3', cost: 5 },
  { from: '3', to: '4', cost: 12 },
  { from: '2', to: '4', cost: 2 },
  { from: '4', to: '5', cost: 4 },
  { from: '4', to: '6', cost: 9 },
  { from: '5', to: '6', cost: 4 },
];

describe('dijkstra (single leg, static costs)', () => {
  it('finds the README test case 1 route A -> C -> D -> E with cost 30', () => {
    expect(dijkstra(readmeGraph, 'A', 'E')).toEqual({
      path: ['A', 'C', 'D', 'E'],
      cost: 30,
    });
  });

  it('matches the image table: 1 -> 2 -> 4 -> 5 -> 6 with cost 18', () => {
    expect(dijkstra(imageGraph, '1', '6')).toEqual({
      path: ['1', '2', '4', '5', '6'],
      cost: 18,
    });
  });

  it('returns null when the destination is unreachable', () => {
    expect(dijkstra(readmeGraph, 'E', 'A')).toBeNull();
  });

  it('returns [origin] with cost 0 when origin equals destination', () => {
    expect(dijkstra(readmeGraph, 'C', 'C')).toEqual({ path: ['C'], cost: 0 });
  });

  it('handles an empty-string node id', () => {
    expect(dijkstra([{ from: '', to: 'B', cost: 1 }], '', 'B')).toEqual({
      path: ['', 'B'],
      cost: 1,
    });
  });

  it('never traverses an edge against its direction', () => {
    expect(dijkstra([{ from: 'A', to: 'B', cost: 1 }], 'B', 'A')).toBeNull();
  });
});
