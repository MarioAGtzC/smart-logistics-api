import { Processor, WorkerHost } from '@nestjs/bullmq';
import { OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { performance } from 'node:perf_hooks';
import { NetworkService } from '../network/network.service';
import { findRoute } from './algorithm/find-route';
import { parsePeakHours, PeakWindow } from './algorithm/peak-hours';
import { RouteError, RouteResult } from './algorithm/types';
import { ROUTE_QUEUE } from './routing.constants';
import { RouteJobData } from './routing.service';

/** What a finished job stores as its return value. */
export type RouteJobResult = { result: RouteResult } | { error: RouteError };

@Processor(ROUTE_QUEUE)
export class RouteProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly peakWindows: PeakWindow[];

  constructor(
    private readonly network: NetworkService,
    private readonly config: ConfigService,
  ) {
    super();
    this.peakWindows = parsePeakHours(config.getOrThrow<string>('PEAK_HOURS'));
  }

  // @Processor options are fixed at import time, before .env is loaded; set concurrency once it is.
  onApplicationBootstrap(): void {
    this.worker.concurrency =
      this.config.getOrThrow<number>('WORKER_CONCURRENCY');
  }

  /**
   * Business errors (unknown node, no route, blocked by the vehicle) are returned: retrying would
   * give the same answer. Anything thrown (e.g. Postgres down) is a system error that BullMQ retries.
   */
  async process(job: Job<RouteJobData>): Promise<RouteJobResult> {
    const { graphId, request } = job.data;
    const graph = await this.network.getGraph(graphId);

    const started = performance.now();
    const outcome = findRoute(graph.edges, request, this.peakWindows);
    const durationMs = performance.now() - started;

    if ('error' in outcome) return { error: outcome.error };
    return {
      result: {
        graphId,
        totalCost: outcome.totalCost,
        path: outcome.path,
        durationMs: Math.round(durationMs * 1000) / 1000,
        departureTime: request.departureTime,
        arrivalTime: outcome.arrivalTime,
      },
    };
  }
}
