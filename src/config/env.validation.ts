import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { parsePeakHours } from '../routing/algorithm/peak-hours';

export class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  // Express's 100kb default is too small for large graphs.
  @Matches(/^\d+(kb|mb)$/i)
  BODY_LIMIT: string = '2mb';

  /** How long finished route jobs stay queryable via GET /route/status. */
  @IsInt()
  @Min(1)
  JOB_RETENTION_SECONDS: number = 86400;

  /** Comma-separated [start, end) windows; empty means no peak hours. Checked by parsePeakHours below. */
  @IsString()
  PEAK_HOURS: string = '07:00-09:00,17:00-19:00';

  /** Route jobs a worker processes in parallel. */
  @IsInt()
  @Min(1)
  WORKER_CONCURRENCY: number = 4;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  // Same parser the worker uses, so the rules live in one place; its message names PEAK_HOURS.
  parsePeakHours(validated.PEAK_HOURS);
  return validated;
}
