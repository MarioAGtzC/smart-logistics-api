import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { NetworkService } from '../network/network.service';
import { JobStatusResponseDto } from './dto/job-status.response.dto';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { toJobStatus } from './job-status.mapper';
import type { RouteJobResult } from './route.processor';
import { ROUTE_QUEUE } from './routing.constants';

const JOB_ID =
  /^job-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

    await this.assertRedisReady();

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

  /** Current status of a route job; 404 if it doesn't exist or has expired. */
  async getStatus(jobId: string): Promise<JobStatusResponseDto> {
    const notFound = new NotFoundException(`Job ${jobId} not found`);
    // Only ids this API issues: anything else could address another key of the queue (e.g. "meta").
    if (!JOB_ID.test(jobId)) throw notFound;

    await this.assertRedisReady();
    const job = await this.queue.getJob(jobId);
    if (!job) throw notFound;
    const state = await job.getState();
    if (state === 'unknown') throw notFound;
    return toJobStatus(jobId, state, job.returnvalue as RouteJobResult);
  }

  // The queue shares the worker's connection, whose offline queue would make commands wait for a
  // reconnect; check the connection first so a Redis outage answers 503 at once.
  private async assertRedisReady(): Promise<void> {
    const redis = await this.queue.getBackend().client;
    if (redis.status !== 'ready') throw this.unavailable();
  }

  private unavailable() {
    return new ServiceUnavailableException(
      'Route queue is unavailable, try again later',
    );
  }
}
