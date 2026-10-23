import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';

export const ROUTE_QUEUE = 'route';
const REDIS_READY_TIMEOUT_MS = 5000;

@Module({
  imports: [BullModule.registerQueue({ name: ROUTE_QUEUE })],
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
