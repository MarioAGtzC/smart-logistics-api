import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EdgeEntity } from './edge.entity';

@Entity('graphs')
export class GraphEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Distinct node ids, computed at upload so GET /network/nodes needs no DISTINCT query. */
  @Column('text', { array: true })
  nodes: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => EdgeEntity, (edge) => edge.graph)
  edges: EdgeEntity[];
}
