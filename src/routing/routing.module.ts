import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { NetworkModule } from '../network/network.module';
import { ROUTE_QUEUE } from './routing.constants';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

const REDIS_READY_TIMEOUT_MS = 5000;

@Module({
  imports: [
    NetworkModule,
    BullModule.registerQueueAsync({
      name: ROUTE_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Producer side: with Redis down, add() throws (-> 503) instead of waiting to reconnect.
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
          enableOfflineQueue: false,
        },
      }),
    }),
  ],
  controllers: [RoutingController],
  providers: [RoutingService],
})
export class RoutingModule implements OnApplicationBootstrap {
  constructor(@InjectQueue(ROUTE_QUEUE) private readonly queue: Queue) {}

  // BullMQ keeps retrying in the background; fail the boot instead of starting half-working.
  async onApplicationBootstrap(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer in ${REDIS_READY_TIMEOUT_MS}ms`)),
        REDIS_READY_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.queue.waitUntilReady(), timeout]);
    } catch (error) {
      throw new Error(
        `Redis is unreachable (check REDIS_URL): ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
