import { Logger } from '@nestjs/common';
import { createGraphCacheStore } from './graph-cache.store';

describe('createGraphCacheStore', () => {
  it('turns Redis errors into a warning instead of crashing the process', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    // Port 1: nothing listens there; the store connects lazily, so no I/O happens here.
    const store = createGraphCacheStore('redis://localhost:1');

    expect(() =>
      store.emit('error', new Error('Socket closed unexpectedly')),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Socket closed unexpectedly'),
    );
    warn.mockRestore();
  });
});
