import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EdgeEntity } from './entities/edge.entity';
import { GraphEntity } from './entities/graph.entity';
import { NetworkService } from './network.service';

const GRAPH_ID = '3f2a9c1e-8b4d-4e6a-9f1b-2c7d5e8a1b3c';

describe('NetworkService.create', () => {
  const tx = {
    save: jest.fn((_: unknown, graph: Partial<GraphEntity>) =>
      Promise.resolve({ ...graph, id: GRAPH_ID }),
    ),
    insert: jest.fn(() => Promise.resolve()),
  };
  const repository = {
    manager: {
      transaction: jest.fn((work: (manager: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    },
  };
  let service: NetworkService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NetworkService,
        { provide: getRepositoryToken(GraphEntity), useValue: repository },
      ],
    }).compile();
    service = module.get(NetworkService);
  });

  const insertedEdges = () =>
    tx.insert.mock.calls.flatMap(
      (call) => (call as unknown as [unknown, Partial<EdgeEntity>[]])[1],
    );

  it('saves the graph and its edges inside one transaction and returns its id', async () => {
    const result = await service.create({
      edges: [{ from: 'A', to: 'B', cost: 10 }],
    });

    expect(result).toEqual({ id: GRAPH_ID });
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(tx.save).toHaveBeenCalledWith(GraphEntity, expect.anything());
    expect(tx.insert).toHaveBeenCalledWith(EdgeEntity, expect.anything());
  });

  it('lists each node once, in order of first appearance', async () => {
    await service.create({
      edges: [
        { from: 'A', to: 'B', cost: 10 },
        { from: 'A', to: 'C', cost: 15 },
        { from: 'B', to: 'D', cost: 12 },
        { from: 'C', to: 'D', cost: 5 },
        { from: 'D', to: 'E', cost: 10 },
      ],
    });

    expect(tx.save.mock.calls[0][1].nodes).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('maps missing optional fields to their defaults and links edges to the graph', async () => {
    await service.create({
      edges: [
        { from: 'A', to: 'B', cost: 10 },
        {
          from: 'B',
          to: 'C',
          cost: 5,
          maxWeight: 5000,
          noHazardous: true,
          trafficMultiplier: 1.5,
        },
      ],
    });

    expect(insertedEdges()).toEqual([
      {
        graph: { id: GRAPH_ID },
        from: 'A',
        to: 'B',
        cost: 10,
        maxWeight: null,
        noHazardous: false,
        trafficMultiplier: 1,
      },
      {
        graph: { id: GRAPH_ID },
        from: 'B',
        to: 'C',
        cost: 5,
        maxWeight: 5000,
        noHazardous: true,
        trafficMultiplier: 1.5,
      },
    ]);
  });

  it('inserts edges in chunks of 1000 to stay under the Postgres parameter limit', async () => {
    const edges = Array.from({ length: 2500 }, (_, i) => ({
      from: `N${i}`,
      to: `N${i + 1}`,
      cost: 1,
    }));

    await service.create({ edges });

    expect(
      tx.insert.mock.calls.map(
        (call) => (call as unknown as [unknown, unknown[]])[1].length,
      ),
    ).toEqual([1000, 1000, 500]);
    expect(insertedEdges()).toHaveLength(2500);
  });

  it('propagates a failed insert so the transaction rolls back', async () => {
    tx.insert.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      service.create({ edges: [{ from: 'A', to: 'B', cost: 1 }] }),
    ).rejects.toThrow('insert failed');
  });
});
