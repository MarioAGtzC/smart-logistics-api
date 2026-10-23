import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { baseDatabaseOptions } from './database.options';

// Entry point for the TypeORM CLI (migration:generate / run / revert), which runs outside Nest.
if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export default new DataSource({
  ...baseDatabaseOptions(url),
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
});
