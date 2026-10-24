import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { NetworkService } from '../network/network.service';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { ROUTE_QUEUE } from './routing.constants';

export interface RouteJobData {
  graphId: string;
  request: OptimizeRouteDto;
}

@Injectable()
export class RoutingService {
  constructor(
    private readonly network: NetworkService,
    @InjectQueue(ROUTE_QUEUE) private readonly queue: Queue<RouteJobData>,
    private readonly config: ConfigService,
  ) {}

  /** Queues a route calculation; 404 if the graph doesn't exist, 503 if Redis can't take the job. */
  async enqueue(
    graphId: string,
    request: OptimizeRouteDto,
  ): Promise<{ jobId: string }> {
    // Also warms the graph cache for the worker.
    await this.network.getGraph(graphId);

    // The queue shares the worker's connection, whose offline queue would make add() wait for a
    // reconnect; check the connection first so a Redis outage answers 503 at once.
    const redis = await this.queue.getBackend().client;
    if (redis.status !== 'ready') throw this.unavailable();

    // BullMQ rejects ids that contain ':' or are all digits; the prefix avoids both.
    const jobId = `job-${randomUUID()}`;
    const retention = {
      age: this.config.getOrThrow<number>('JOB_RETENTION_SECONDS'),
      count: 1000,
    };
    try {
      await this.queue.add(
        'optimize',
        { graphId, request },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: retention,
          removeOnFail: retention,
        },
      );
    } catch {
      throw this.unavailable();
    }
    return { jobId };
  }

  private unavailable() {
    return new ServiceUnavailableException(
      'Route queue is unavailable, try again later',
    );
  }
}
