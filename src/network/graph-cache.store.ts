import { createKeyv } from '@keyv/redis';
import { Logger } from '@nestjs/common';

const logger = new Logger('GraphCache');

/**
 * Redis-backed Keyv store for the graph cache. A Redis outage must never take the API down:
 * - Keyv rethrows an 'error' event nobody listens to, which would crash the process; with a
 *   listener, failed reads become cache misses and the API keeps serving from Postgres.
 * - disableOfflineQueue makes commands fail at once while Redis is down instead of waiting for
 *   the reconnect, so requests fall back to Postgres without stalling.
 */
export function createGraphCacheStore(redisUrl: string) {
  const store = createKeyv({ url: redisUrl, disableOfflineQueue: true });
  store.on('error', (error: unknown) =>
    logger.warn(
      `Redis cache unavailable, reading from Postgres: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
  return store;
}
