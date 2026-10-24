import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { NetworkService } from '../network/network.service';
import { RouteJobData } from './routing.service';
import { RouteProcessor } from './route.processor';

const GRAPH_ID = '3f2a9c1e-8b4d-4e6a-9f1b-2c7d5e8a1b3c';

// README validation graph, as stored (maxWeight may be null for "no limit").
const edges = [
  {
    from: 'A',
    to: 'B',
    cost: 10,
    maxWeight: 10000,
    noHazardous: false,
    trafficMultiplier: 1.0,
  },
  {
    from: 'A',
    to: 'C',
    cost: 15,
    maxWeight: 5000,
    noHazardous: true,
    trafficMultiplier: 1.5,
  },
  {
    from: 'B',
    to: 'D',
    cost: 12,
    maxWeight: 10000,
    noHazardous: false,
    trafficMultiplier: 2.0,
  },
  {
    from: 'C',
    to: 'D',
    cost: 5,
    maxWeight: 5000,
    noHazardous: true,
    trafficMultiplier: 1.0,
  },
  {
    from: 'D',
    to: 'E',
    cost: 10,
    maxWeight: null,
    noHazardous: false,
    trafficMultiplier: 1.2,
  },
];

const job = (request: RouteJobData['request']) =>
  ({ data: { graphId: GRAPH_ID, request } }) as Job<RouteJobData>;

describe('RouteProcessor', () => {
  const network = { getGraph: jest.fn() };
  const env: Record<string, unknown> = {
    PEAK_HOURS: '07:00-09:00,17:00-19:00',
    WORKER_CONCURRENCY: 7,
  };
  let processor: RouteProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    network.getGraph.mockResolvedValue({ id: GRAPH_ID, nodes: [], edges });
    const module = await Test.createTestingModule({
      providers: [
        RouteProcessor,
        { provide: NetworkService, useValue: network },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (k: string) => env[k] },
        },
      ],
    }).compile();
    processor = module.get(RouteProcessor);
  });

  it('returns the README case 1 route as { result }', async () => {
    const outcome = await processor.process(
      job({
        originNodeId: 'A',
        destinationNodeId: 'E',
        vehicleProfile: { type: 'van', weight: 3000, hazardous: false },
        departureTime: '12:00',
      }),
    );

    expect(network.getGraph).toHaveBeenCalledWith(GRAPH_ID);
    expect(outcome).toEqual({
      result: {
        graphId: GRAPH_ID,
        totalCost: 30,
        path: ['A', 'C', 'D', 'E'],
        durationMs: expect.any(Number) as number,
        departureTime: '12:00',
        arrivalTime: '12:30',
      },
    });
  });

  it('measures durationMs as a non-negative number', async () => {
    const outcome = await processor.process(
      job({
        originNodeId: 'A',
        destinationNodeId: 'E',
        departureTime: '12:00',
      }),
    );
    const durationMs = 'result' in outcome ? outcome.result.durationMs : -1;
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('applies the PEAK_HOURS windows (departing 06:50 costs 32)', async () => {
    const outcome = await processor.process(
      job({
        originNodeId: 'A',
        destinationNodeId: 'E',
        departureTime: '06:50',
      }),
    );
    expect(outcome).toMatchObject({
      result: { totalCost: 32, arrivalTime: '07:22' },
    });
  });

  it('returns business errors as { error } instead of throwing (no retries)', async () => {
    await expect(
      processor.process(
        job({
          originNodeId: 'Z',
          destinationNodeId: 'E',
          departureTime: '12:00',
        }),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_NODE' } });
  });

  it('rethrows system errors so BullMQ retries the job', async () => {
    network.getGraph.mockRejectedValue(new Error('connection refused'));

    await expect(
      processor.process(
        job({
          originNodeId: 'A',
          destinationNodeId: 'E',
          departureTime: '12:00',
        }),
      ),
    ).rejects.toThrow('connection refused');
  });

  it('sets the worker concurrency from WORKER_CONCURRENCY at bootstrap', () => {
    const worker = { concurrency: 1 };
    Object.defineProperty(processor, 'worker', { get: () => worker });

    processor.onApplicationBootstrap();

    expect(worker.concurrency).toBe(7);
  });
});
