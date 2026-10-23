import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EdgeEntity } from './entities/edge.entity';
import { GraphEntity } from './entities/graph.entity';
import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';

@Module({
  imports: [TypeOrmModule.forFeature([GraphEntity, EdgeEntity])],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
