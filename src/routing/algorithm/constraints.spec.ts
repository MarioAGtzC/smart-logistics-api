import { canTraverse } from './constraints';
import { Edge, VehicleProfile } from './types';

const truck = (weight: number, hazardous = false): VehicleProfile => ({
  type: 'truck',
  weight,
  hazardous,
});

describe('canTraverse', () => {
  const restricted: Edge = {
    from: 'A',
    to: 'B',
    cost: 1,
    maxWeight: 5000,
    noHazardous: true,
  };

  it('allows any vehicle on an edge without optional fields', () => {
    expect(canTraverse({ from: 'A', to: 'B', cost: 1 }, truck(1e9, true))).toBe(
      true,
    );
  });

  it('allows a vehicle whose weight equals maxWeight', () => {
    expect(canTraverse(restricted, truck(5000))).toBe(true);
  });

  it('blocks a vehicle heavier than maxWeight', () => {
    expect(canTraverse(restricted, truck(5001))).toBe(false);
  });

  it('blocks a hazardous load on a noHazardous edge', () => {
    expect(canTraverse(restricted, truck(1000, true))).toBe(false);
  });

  it('allows a non-hazardous load on a noHazardous edge', () => {
    expect(canTraverse(restricted, truck(1000, false))).toBe(true);
  });

  it('allows everything when there is no vehicle profile', () => {
    expect(canTraverse(restricted, undefined)).toBe(true);
  });
});
