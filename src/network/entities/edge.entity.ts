import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GraphEntity } from './graph.entity';

@Entity('edges')
export class EdgeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => GraphEntity, (graph) => graph.edges, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'graph_id' })
  @Index()
  graph: GraphEntity;

  @Column({ name: 'from_node', type: 'text' })
  from: string;

  @Column({ name: 'to_node', type: 'text' })
  to: string;

  /** Travel time in minutes. double precision: pg returns numeric columns as strings. */
  @Column('double precision')
  cost: number;

  /** null = no weight limit. */
  @Column({ name: 'max_weight', type: 'double precision', nullable: true })
  maxWeight: number | null;

  @Column({ name: 'no_hazardous', type: 'boolean', default: false })
  noHazardous: boolean;

  @Column({ name: 'traffic_multiplier', type: 'double precision', default: 1 })
  trafficMultiplier: number;
}
