import 'dotenv/config';

import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { AuthSession } from '../modules/auth-sessions/entities/auth-session.entity';
import { DriverLocation } from '../modules/driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../modules/driver-operations/entities/driver-operational-state.entity';
import { DriverDocument } from '../modules/drivers/entities/driver-document.entity';
import { DriverProfile } from '../modules/drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../modules/drivers/entities/driver-vehicle.entity';
import { FareQuote } from '../modules/fares/entities/fare-quote.entity';
import { FareRule } from '../modules/fares/entities/fare-rule.entity';
import { PassengerProfile } from '../modules/passengers/entities/passenger-profile.entity';
import { RideOffer } from '../modules/rides/entities/ride-offer.entity';
import { Ride } from '../modules/rides/entities/ride.entity';
import { ServiceZone } from '../modules/service-zones/entities/service-zone.entity';
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

  entities: [
    User,
    AuthSession,
    PassengerProfile,
    DriverProfile,
    DriverVehicle,
    DriverDocument,
    DriverOperationalState,
    DriverLocation,
    ServiceZone,
    FareRule,
    FareQuote,
    Ride,
    RideOffer,
  ],

  migrations: [join(__dirname, 'migrations', '*.js')],

  migrationsTableName: 'typeorm_migrations',

  synchronize: false,

  logging: process.env.NODE_ENV === 'development',
});

export default AppDataSource;
