import { Edge, VehicleProfile } from './types';

/** Missing maxWeight means no limit; missing noHazardous means hazardous loads are allowed. */
export function canTraverse(edge: Edge, vehicle?: VehicleProfile): boolean {
  if (!vehicle) return true;
  if (vehicle.weight > (edge.maxWeight ?? Infinity)) return false;
  return !(vehicle.hazardous && edge.noHazardous);
}
