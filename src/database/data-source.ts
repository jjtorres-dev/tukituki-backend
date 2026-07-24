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
import { UserDevice } from '../modules/notifications/entities/user-device.entity';
import { UserNotification } from '../modules/notifications/entities/user-notification.entity';
import { OutboxEvent } from '../modules/outbox/entities/outbox-event.entity';
import { AdminAuditLog } from '../modules/operations/entities/admin-audit-log.entity';
import { DigitalPaymentAttempt } from '../modules/payments/entities/digital-payment-attempt.entity';
import { RidePayment } from '../modules/payments/entities/ride-payment.entity';
import { CancellationPolicy } from '../modules/rides/entities/cancellation-policy.entity';
import { RideCancellation } from '../modules/rides/entities/ride-cancellation.entity';
import { RideFinalFare } from '../modules/rides/entities/ride-final-fare.entity';
import { RideWaiting } from '../modules/rides/entities/ride-waiting.entity';
import { UserFinancialObligation } from '../modules/rides/entities/user-financial-obligation.entity';
import { RideLocationSample } from '../modules/rides/entities/ride-location-sample.entity';
import { RideOffer } from '../modules/rides/entities/ride-offer.entity';
import { RideProgressMetrics } from '../modules/rides/entities/ride-progress-metrics.entity';
import { RideRating } from '../modules/rides/entities/ride-rating.entity';
import { RideStartCode } from '../modules/rides/entities/ride-start-code.entity';
import { RideStatusHistory } from '../modules/rides/entities/ride-status-history.entity';
import { Ride } from '../modules/rides/entities/ride.entity';
import { EmergencyContactAlert } from '../modules/safety/entities/emergency-contact-alert.entity';
import { EmergencyContact } from '../modules/safety/entities/emergency-contact.entity';
import { RideSafetyIncident } from '../modules/safety/entities/ride-safety-incident.entity';
import { RideShareAccessLog } from '../modules/safety/entities/ride-share-access-log.entity';
import { RideShareLink } from '../modules/safety/entities/ride-share-link.entity';
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
    UserDevice,
    UserNotification,
    OutboxEvent,
    AdminAuditLog,
    DigitalPaymentAttempt,
    RidePayment,
    DriverProfile,
    DriverVehicle,
    DriverDocument,
    DriverOperationalState,
    DriverLocation,
    ServiceZone,
    FareRule,
    FareQuote,
    Ride,
    CancellationPolicy,
    RideCancellation,
    RideWaiting,
    UserFinancialObligation,
    RideOffer,
    RideStartCode,
    RideStatusHistory,
    RideLocationSample,
    RideProgressMetrics,
    RideFinalFare,
    RideRating,
    EmergencyContact,
    RideSafetyIncident,
    RideShareLink,
    RideShareAccessLog,
    EmergencyContactAlert,
  ],

  migrations: [join(__dirname, 'migrations', '*.js')],

  migrationsTableName: 'typeorm_migrations',

  synchronize: false,

  logging: process.env.NODE_ENV === 'development',
});

export default AppDataSource;
