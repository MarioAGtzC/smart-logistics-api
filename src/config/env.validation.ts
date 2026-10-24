import { plainToInstance } from 'class-transformer';
import { IsInt, IsUrl, Matches, Max, Min, validateSync } from 'class-validator';

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
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
