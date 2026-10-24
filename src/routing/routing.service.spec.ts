import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NetworkService } from '../network/network.service';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { ROUTE_QUEUE } from './routing.constants';
import { RoutingService } from './routing.service';

const GRAPH_ID = '3f2a9c1e-8b4d-4e6a-9f1b-2c7d5e8a1b3c';
const request: OptimizeRouteDto = {
  originNodeId: 'A',
  destinationNodeId: 'E',
  departureTime: '08:00',
};

describe('RoutingService.enqueue', () => {
  const network = { getGraph: jest.fn() };
  const redis = { status: 'ready' };
  const queue = {
    add: jest.fn(),
    getBackend: () => ({ client: Promise.resolve(redis) }),
  };
  let service: RoutingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    redis.status = 'ready';
    network.getGraph.mockResolvedValue({ id: GRAPH_ID });
    queue.add.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        RoutingService,
        { provide: NetworkService, useValue: network },
        { provide: getQueueToken(ROUTE_QUEUE), useValue: queue },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 86400 },
        },
      ],
    }).compile();
    service = module.get(RoutingService);
  });

  it('enqueues { graphId, request } with a job-<uuid> id, retries and retention', async () => {
    const { jobId } = await service.enqueue(GRAPH_ID, request);

    expect(jobId).toMatch(
      /^job-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(queue.add).toHaveBeenCalledWith(
      'optimize',
      { graphId: GRAPH_ID, request },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 },
      },
    );
  });

  it('gives every job a different id', async () => {
    const a = await service.enqueue(GRAPH_ID, request);
    const b = await service.enqueue(GRAPH_ID, request);
    expect(a.jobId).not.toBe(b.jobId);
  });

  it('enqueues nothing when the graph does not exist (404)', async () => {
    network.getGraph.mockRejectedValue(new NotFoundException('nope'));

    await expect(service.enqueue(GRAPH_ID, request)).rejects.toThrow(
      NotFoundException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each(['reconnecting', 'connecting', 'end'])(
    'answers 503 without calling add when the Redis connection is %s',
    async (status) => {
      redis.status = status;

      await expect(service.enqueue(GRAPH_ID, request)).rejects.toThrow(
        ServiceUnavailableException,
      );
      // add() would wait for the reconnect: the shared connection keeps an offline queue for the worker.
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('answers 503 when Redis rejects the job', async () => {
    queue.add.mockRejectedValue(new Error('Connection is closed.'));

    await expect(service.enqueue(GRAPH_ID, request)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('RoutingService.getStatus', () => {
  const JOB_ID = 'job-8e244475-cea4-408f-9545-26842a6cae42';
  const redis = { status: 'ready' };
  const job = {
    getState: jest.fn(),
    returnvalue: undefined as unknown,
  };
  const queue = {
    getJob: jest.fn(),
    getBackend: () => ({ client: Promise.resolve(redis) }),
  };
  let service: RoutingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    redis.status = 'ready';
    queue.getJob.mockResolvedValue(job);
    const module = await Test.createTestingModule({
      providers: [
        RoutingService,
        { provide: NetworkService, useValue: {} },
        { provide: getQueueToken(ROUTE_QUEUE), useValue: queue },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();
    service = module.get(RoutingService);
  });

  it('maps the BullMQ state and return value', async () => {
    job.getState.mockResolvedValue('completed');
    job.returnvalue = { error: { code: 'NO_ROUTE', message: 'x' } };

    await expect(service.getStatus(JOB_ID)).resolves.toEqual({
      jobId: JOB_ID,
      status: 'FAILED',
      error: { code: 'NO_ROUTE', message: 'x' },
    });
    expect(queue.getJob).toHaveBeenCalledWith(JOB_ID);
  });

  it('404 when the job does not exist or has expired', async () => {
    queue.getJob.mockResolvedValue(undefined);

    await expect(service.getStatus(JOB_ID)).rejects.toThrow(NotFoundException);
  });

  it("404 when BullMQ reports the state as 'unknown'", async () => {
    job.getState.mockResolvedValue('unknown');

    await expect(service.getStatus(JOB_ID)).rejects.toThrow(NotFoundException);
  });

  it.each(['meta', 'job-123', 'abc:def', ''])(
    '404 without querying Redis for a malformed id %p',
    async (id) => {
      await expect(service.getStatus(id)).rejects.toThrow(NotFoundException);
      expect(queue.getJob).not.toHaveBeenCalled();
    },
  );

  it('503 when the Redis connection is not ready', async () => {
    redis.status = 'reconnecting';

    await expect(service.getStatus(JOB_ID)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(queue.getJob).not.toHaveBeenCalled();
  });
});
