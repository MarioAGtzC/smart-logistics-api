import type { RouteErrorCode } from '../algorithm/types';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export class RouteResultDto {
  graphId: string;
  /** Minutes, including peak-hour multipliers. */
  totalCost: number;
  /** Node ids from origin to destination, through the waypoints in order. */
  path: string[];
  /** Time spent computing the route, in milliseconds. */
  durationMs: number;
  /** "HH:mm" */
  departureTime: string;
  /** "HH:mm", rounded to the minute; wraps past midnight. */
  arrivalTime: string;
}

export class RouteErrorDto {
  /** INVALID_NODE, NO_ROUTE, ROUTE_BLOCKED_BY_CONSTRAINTS or INTERNAL_ERROR. */
  code: RouteErrorCode;
  message: string;
}

export class JobStatusResponseDto {
  jobId: string;
  /** PENDING, PROCESSING, COMPLETED or FAILED. */
  status: JobStatus;
  /** Present when status is COMPLETED. */
  result?: RouteResultDto;
  /** Present when status is FAILED. */
  error?: RouteErrorDto;
}
