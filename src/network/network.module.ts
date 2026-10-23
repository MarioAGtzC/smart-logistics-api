import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EdgeEntity } from './entities/edge.entity';
import { GraphEntity } from './entities/graph.entity';
import { createGraphCacheStore } from './graph-cache.store';
import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GraphEntity, EdgeEntity]),
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [createGraphCacheStore(config.getOrThrow<string>('REDIS_URL'))],
      }),
    }),
  ],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
