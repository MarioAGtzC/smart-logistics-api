import { Queue } from 'bullmq';
import { RoutingModule } from './routing.module';

describe('RoutingModule (Redis readiness at boot)', () => {
  afterEach(() => jest.useRealTimers());

  it('boots when Redis is reachable', async () => {
    const queue = { waitUntilReady: jest.fn().mockResolvedValue(undefined) };
    const module = new RoutingModule(queue as unknown as Queue);

    await expect(module.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('fails with a clear error when Redis does not answer in time', async () => {
    jest.useFakeTimers();
    const queue = { waitUntilReady: jest.fn(() => new Promise(() => {})) };
    const module = new RoutingModule(queue as unknown as Queue);

    const boot = module.onApplicationBootstrap();
    jest.advanceTimersByTime(5000);

    await expect(boot).rejects.toThrow(/Redis is unreachable/);
  });

  it('fails with a clear error when the connection is refused', async () => {
    const queue = {
      waitUntilReady: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const module = new RoutingModule(queue as unknown as Queue);

    await expect(module.onApplicationBootstrap()).rejects.toThrow(
      /Redis is unreachable.*ECONNREFUSED/,
    );
  });
});
