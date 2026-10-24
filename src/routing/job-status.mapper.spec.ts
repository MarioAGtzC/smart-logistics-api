import { toJobStatus } from './job-status.mapper';
import { RouteJobResult } from './route.processor';

const JOB_ID = 'job-8e244475-cea4-408f-9545-26842a6cae42';
const result = {
  graphId: '3f2a9c1e-8b4d-4e6a-9f1b-2c7d5e8a1b3c',
  totalCost: 30,
  path: ['A', 'C', 'D', 'E'],
  durationMs: 0.1,
  departureTime: '12:00',
  arrivalTime: '12:30',
};

describe('toJobStatus', () => {
  it.each(['waiting', 'delayed', 'prioritized', 'waiting-children'] as const)(
    '%s -> PENDING',
    (state) => {
      expect(toJobStatus(JOB_ID, state, undefined)).toEqual({
        jobId: JOB_ID,
        status: 'PENDING',
      });
    },
  );

  it('active -> PROCESSING', () => {
    expect(toJobStatus(JOB_ID, 'active', undefined)).toEqual({
      jobId: JOB_ID,
      status: 'PROCESSING',
    });
  });

  it('completed with a result -> COMPLETED with the result', () => {
    const value: RouteJobResult = { result };
    expect(toJobStatus(JOB_ID, 'completed', value)).toEqual({
      jobId: JOB_ID,
      status: 'COMPLETED',
      result,
    });
  });

  it('completed with a business error -> FAILED with that error code', () => {
    const error = {
      code: 'NO_ROUTE' as const,
      message: 'No route from E to A',
    };
    expect(toJobStatus(JOB_ID, 'completed', { error })).toEqual({
      jobId: JOB_ID,
      status: 'FAILED',
      error,
    });
  });

  it('failed (retries exhausted) -> FAILED with a generic INTERNAL_ERROR', () => {
    expect(toJobStatus(JOB_ID, 'failed', undefined)).toEqual({
      jobId: JOB_ID,
      status: 'FAILED',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The route could not be calculated; try again later',
      },
    });
  });

  it('completed without a return value -> FAILED with INTERNAL_ERROR', () => {
    expect(toJobStatus(JOB_ID, 'completed', null)).toMatchObject({
      status: 'FAILED',
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});
