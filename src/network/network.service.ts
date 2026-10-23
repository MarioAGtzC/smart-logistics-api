import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadNetworkDto } from './dto/upload-network.dto';
import { EdgeEntity } from './entities/edge.entity';
import { GraphEntity } from './entities/graph.entity';

// 1000 edges x 7 columns = 7000 bind parameters per INSERT; Postgres caps a query at 65535.
const EDGE_INSERT_CHUNK = 1000;

@Injectable()
export class NetworkService {
  constructor(
    @InjectRepository(GraphEntity)
    private readonly graphs: Repository<GraphEntity>,
  ) {}

  /** Stores the graph and all its edges atomically: a failed insert leaves no partial graph. */
  async create(dto: UploadNetworkDto): Promise<{ id: string }> {
    return this.graphs.manager.transaction(async (manager) => {
      const graph = await manager.save(GraphEntity, {
        nodes: [...new Set(dto.edges.flatMap((edge) => [edge.from, edge.to]))],
      });
      const edges = dto.edges.map((edge) => ({
        graph: { id: graph.id },
        from: edge.from,
        to: edge.to,
        cost: edge.cost,
        maxWeight: edge.maxWeight ?? null,
        noHazardous: edge.noHazardous ?? false,
        trafficMultiplier: edge.trafficMultiplier ?? 1,
      }));
      for (let i = 0; i < edges.length; i += EDGE_INSERT_CHUNK) {
        await manager.insert(EdgeEntity, edges.slice(i, i + EDGE_INSERT_CHUNK));
      }
      return { id: graph.id };
    });
  }

  /** Loads a graph with its edges in upload order; 404 if it does not exist. */
  async getGraph(id: string): Promise<GraphEntity> {
    const graph = await this.graphs.findOneBy({ id });
    if (!graph) throw new NotFoundException(`Graph ${id} not found`);
    // Separate query, not a JOIN: a JOIN repeats the graph's nodes array on every edge row (OOM at 10k edges).
    graph.edges = await this.graphs.manager.find(EdgeEntity, {
      where: { graph: { id } },
      order: { id: 'ASC' },
    });
    return graph;
  }
}
