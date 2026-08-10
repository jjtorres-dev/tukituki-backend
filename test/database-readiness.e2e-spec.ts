import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import type { DataSource } from 'typeorm';

import AppDataSource from '../src/database/data-source';
import { seedDevelopmentData } from '../src/database/seeds/development-data.seed';

const DEFAULT_ADMIN_PHONE = '+51900000000';
const DEFAULT_PASSENGER_PHONE = '+51900000001';
const DEFAULT_DRIVER_PHONE = '+51900000002';

interface CountRow {
  count: string;
}

interface DatabaseNameRow {
  databaseName: string;
}

interface ExtensionRow {
  extensionName: string;
}

interface TableRow {
  tableName: string;
}

function runCompiledMigrations(): void {
  execFileSync(
    process.execPath,
    [
      join(process.cwd(), 'node_modules', 'typeorm', 'cli.js'),
      'migration:run',
      '-d',
      'dist/database/data-source.js',
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    },
  );
}
async function queryRows<T>(
  dataSource: DataSource,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  const result: unknown = await dataSource.query(sql, parameters);
  return result as T[];
}

describe('Database readiness smoke', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('El smoke de base de datos exige NODE_ENV=test');
    }

    dataSource = AppDataSource;
    await dataSource.initialize();

    const databaseRows = await queryRows<DatabaseNameRow>(
      dataSource,
      `SELECT current_database() AS "databaseName"`,
    );
    const databaseName = databaseRows[0]?.databaseName ?? '';

    if (!/(?:^|[_-])(test|smoke)(?:$|[_-])/i.test(databaseName)) {
      throw new Error(
        `La base ${databaseName} no parece desechable; usa un nombre con test o smoke`,
      );
    }

    const existingTables = await queryRows<TableRow>(
      dataSource,
      `SELECT tablename AS "tableName"
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename <> 'spatial_ref_sys'
       ORDER BY tablename`,
    );

    if (existingTables.length > 0) {
      throw new Error(
        `El smoke exige una base limpia; tablas encontradas: ${existingTables
          .map((row) => row.tableName)
          .join(', ')}`,
      );
    }

    await dataSource.destroy();
    runCompiledMigrations();
    await dataSource.initialize();
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('aplica todas las migraciones y habilita extensiones requeridas', async () => {
    const migrationRows = await queryRows<CountRow>(
      dataSource,
      `SELECT COUNT(*)::text AS count FROM typeorm_migrations`,
    );
    const extensions = await queryRows<ExtensionRow>(
      dataSource,
      `SELECT extname AS "extensionName"
       FROM pg_extension
       WHERE extname IN ('postgis', 'uuid-ossp')
       ORDER BY extname`,
    );
    const requiredTables = await queryRows<TableRow>(
      dataSource,
      `SELECT tablename AS "tableName"
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN (
           'users',
           'service_zones',
           'fare_rules',
           'rides',
           'ride_payments',
           'ride_commissions',
           'driver_settlements',
           'promotions'
         )
       ORDER BY tablename`,
    );

    expect(Number(migrationRows[0]?.count)).toBe(28);
    expect(extensions.map((row) => row.extensionName)).toEqual([
      'postgis',
      'uuid-ossp',
    ]);
    expect(requiredTables).toHaveLength(8);
  });

  it('ejecuta dos veces el seed operativo sin duplicar datos', async () => {
    await seedDevelopmentData(dataSource);
    await seedDevelopmentData(dataSource);

    const adminPhone =
      process.env.DEV_SEED_ADMIN_PHONE_E164 ?? DEFAULT_ADMIN_PHONE;
    const passengerPhone =
      process.env.DEV_SEED_PASSENGER_PHONE_E164 ?? DEFAULT_PASSENGER_PHONE;
    const driverPhone =
      process.env.DEV_SEED_DRIVER_PHONE_E164 ?? DEFAULT_DRIVER_PHONE;
    const users = await queryRows<CountRow>(
      dataSource,
      `SELECT COUNT(*)::text AS count
       FROM users
       WHERE phone_e164 = ANY($1::varchar[])`,
      [[adminPhone, passengerPhone, driverPhone]],
    );
    const driverDocuments = await queryRows<CountRow>(
      dataSource,
      `SELECT COUNT(*)::text AS count
       FROM driver_documents document
       INNER JOIN driver_profiles profile
         ON profile.id = document.driver_profile_id
       INNER JOIN users driver ON driver.id = profile.user_id
       WHERE driver.phone_e164 = $1`,
      [driverPhone],
    );
    const zones = await queryRows<CountRow>(
      dataSource,
      `SELECT COUNT(*)::text AS count
       FROM service_zones
       WHERE code = 'TARAPOTO_DEV'`,
    );
    const rules = await queryRows<CountRow>(
      dataSource,
      `SELECT COUNT(*)::text AS count
       FROM fare_rules rule
       INNER JOIN service_zones zone ON zone.id = rule.service_zone_id
       WHERE zone.code = 'TARAPOTO_DEV'
         AND rule.name = 'Tarifa mototaxi desarrollo'`,
    );

    expect(Number(users[0]?.count)).toBe(3);
    expect(Number(driverDocuments[0]?.count)).toBe(6);
    expect(Number(zones[0]?.count)).toBe(1);
    expect(Number(rules[0]?.count)).toBe(1);
  }, 30_000);
});
