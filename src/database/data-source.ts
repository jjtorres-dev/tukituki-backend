import 'dotenv/config';

import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { User } from '../modules/users/entities/user.entity';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }

  return value;
}

const databasePort = Number(getRequiredEnvironmentVariable('DATABASE_PORT'));

if (!Number.isInteger(databasePort)) {
  throw new Error('DATABASE_PORT debe ser un número entero');
}

const AppDataSource = new DataSource({
  type: 'postgres',

  host: getRequiredEnvironmentVariable('DATABASE_HOST'),
  port: databasePort,

  database: getRequiredEnvironmentVariable('DATABASE_NAME'),
  username: getRequiredEnvironmentVariable('DATABASE_USER'),
  password: getRequiredEnvironmentVariable('DATABASE_PASSWORD'),

  ssl:
    process.env.DATABASE_SSL === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : false,

  entities: [User],

  migrations: [join(__dirname, 'migrations', '*.js')],

  migrationsTableName: 'typeorm_migrations',

  synchronize: false,

  logging: process.env.NODE_ENV === 'development',
});

export default AppDataSource;
