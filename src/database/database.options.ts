import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';

// Shared by the Nest app and the TypeORM CLI; schema changes go through migrations only.
export const baseDatabaseOptions = (url: string): DataSourceOptions => ({
  type: 'postgres',
  url,
  synchronize: false,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
});
