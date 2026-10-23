export interface Node {
  id: string;
}

export interface Edge {
  from: string;
  to: string;
  /** Travel time in minutes. */
  cost: number;
  /** Max vehicle weight allowed; no limit when absent. */
  maxWeight?: number;
  /** Hazardous loads are banned when true; defaults to false. */
  noHazardous?: boolean;
  /** Cost multiplier during peak hours; defaults to 1. */
  trafficMultiplier?: number;
}

export interface VehicleProfile {
  type: string;
  weight: number;
  hazardous: boolean;
}

export interface RouteRequest {
  originNodeId: string;
  destinationNodeId: string;
  waypoints?: string[];
  vehicleProfile?: VehicleProfile;
  /** "HH:mm" */
  departureTime: string;
}

export interface RouteResult {
  graphId: string;
  totalCost: number;
  path: string[];
  durationMs: number;
  departureTime: string;
  arrivalTime: string;
}

export type RouteErrorCode =
  | 'INVALID_NODE'
  | 'NO_ROUTE'
  | 'ROUTE_BLOCKED_BY_CONSTRAINTS'
  | 'INTERNAL_ERROR';

export interface RouteError {
  code: RouteErrorCode;
  message: string;
}
