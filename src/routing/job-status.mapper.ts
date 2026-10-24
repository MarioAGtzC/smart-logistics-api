import type { JobState } from 'bullmq';
import { JobStatusResponseDto } from './dto/job-status.response.dto';
import type { RouteJobResult } from './route.processor';

// Retries exhausted on a system error: keep internals (stack, driver messages) out of the response.
const INTERNAL_ERROR = {
  code: 'INTERNAL_ERROR' as const,
  message: 'The route could not be calculated; try again later',
};

/** Translates a BullMQ job state (and its return value) into the API's job status. */
export function toJobStatus(
  jobId: string,
  state: JobState,
  returnvalue: RouteJobResult | null | undefined,
): JobStatusResponseDto {
  switch (state) {
    case 'waiting':
    case 'delayed': // also a job waiting for its next retry
    case 'prioritized':
    case 'waiting-children':
      return { jobId, status: 'PENDING' };
    case 'active':
      return { jobId, status: 'PROCESSING' };
    case 'completed':
      if (returnvalue && 'result' in returnvalue) {
        return { jobId, status: 'COMPLETED', result: returnvalue.result };
      }
      return {
        jobId,
        status: 'FAILED',
        error: returnvalue?.error ?? INTERNAL_ERROR,
      };
    case 'failed':
      return { jobId, status: 'FAILED', error: INTERNAL_ERROR };
  }
}
