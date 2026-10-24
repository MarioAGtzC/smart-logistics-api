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
  const queue = { add: jest.fn() };
  let service: RoutingService;

  beforeEach(async () => {
    jest.clearAllMocks();
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

  it('answers 503 instead of hanging when Redis rejects the job', async () => {
    queue.add.mockRejectedValue(
      new Error(
        "Stream isn't writeable and enableOfflineQueue options is false",
      ),
    );

    await expect(service.enqueue(GRAPH_ID, request)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
