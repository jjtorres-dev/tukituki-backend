import 'dotenv/config';
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { hash } from 'bcrypt';
import type { DataSource, EntityManager } from 'typeorm';

import AppDataSource from '../data-source';
import { DriverLocation } from '../../modules/driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../../modules/driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../../modules/driver-operations/enums/driver-operational-status.enum';
import { DriverDocument } from '../../modules/drivers/entities/driver-document.entity';
import { DriverProfile } from '../../modules/drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../../modules/drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../../modules/drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../../modules/drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../../modules/drivers/enums/driver-status.enum';
import { IdentityDocumentType } from '../../modules/drivers/enums/identity-document-type.enum';
import { VehicleStatus } from '../../modules/drivers/enums/vehicle-status.enum';
import { VehicleType } from '../../modules/drivers/enums/vehicle-type.enum';
import { FareRule } from '../../modules/fares/entities/fare-rule.entity';
import { FareRuleStatus } from '../../modules/fares/enums/fare-rule-status.enum';
import { PassengerProfile } from '../../modules/passengers/entities/passenger-profile.entity';
import { ServiceZone } from '../../modules/service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../../modules/service-zones/enums/service-zone-status.enum';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { UserStatus } from '../../modules/users/enums/user-status.enum';
import { assertDevelopmentSeedEnvironment } from './seed-environment.guard';

const logger = new Logger('DevelopmentDataSeed');

const DEFAULT_ADMIN_PHONE = '+51900000000';
const DEFAULT_PASSENGER_PHONE = '+51900000001';
const DEFAULT_DRIVER_PHONE = '+51900000002';
const DEFAULT_PASSWORD = 'TukiTukiDev123!';
const SERVICE_ZONE_CODE = 'TARAPOTO_DEV';
const FARE_RULE_NAME = 'Tarifa mototaxi desarrollo';
const DRIVER_DOCUMENT_NUMBER = '70000002';

const TARAPOTO_CENTER = {
  latitude: -6.4865,
  longitude: -76.3599,
};

const TARAPOTO_BOUNDARY = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-76.42, -6.56],
      [-76.29, -6.56],
      [-76.29, -6.41],
      [-76.42, -6.41],
      [-76.42, -6.56],
    ],
  ],
};

interface SeededUsers {
  admin: User;
  passenger: User;
  driver: User;
}

export interface SeedResult {
  adminUserId: string;
  passengerUserId: string;
  driverUserId: string;
  driverProfileId: string;
  serviceZoneId: string;
  fareRuleId: string;
}

function environmentValue(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function assertPhone(name: string, phoneE164: string): void {
  if (!/^\+519\d{8}$/.test(phoneE164)) {
    throw new Error(`${name} debe tener el formato +519XXXXXXXX`);
  }
}

function assertPassword(password: string): void {
  if (password.length < 12) {
    throw new Error('DEV_SEED_PASSWORD debe tener al menos 12 caracteres');
  }
}

async function upsertUser(
  manager: EntityManager,
  phoneE164: string,
  role: UserRole,
  passwordHash: string,
): Promise<User> {
  const repository = manager.getRepository(User);
  let user = await repository
    .createQueryBuilder('user')
    .withDeleted()
    .where('user.phone_e164 = :phoneE164', { phoneE164 })
    .getOne();

  if (!user) {
    user = repository.create({
      phoneE164,
      passwordHash,
      roles: [role],
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      lastLoginAt: null,
      deletedAt: null,
    });
  } else {
    user.passwordHash = passwordHash;
    user.roles = Array.from(new Set([...user.roles, role]));
    user.status = UserStatus.ACTIVE;
    user.isPhoneVerified = true;
    user.deletedAt = null;
  }

  return repository.save(user);
}

async function seedUsers(
  manager: EntityManager,
  passwordHash: string,
): Promise<SeededUsers> {
  const adminPhone = environmentValue(
    'DEV_SEED_ADMIN_PHONE_E164',
    DEFAULT_ADMIN_PHONE,
  );
  const passengerPhone = environmentValue(
    'DEV_SEED_PASSENGER_PHONE_E164',
    DEFAULT_PASSENGER_PHONE,
  );
  const driverPhone = environmentValue(
    'DEV_SEED_DRIVER_PHONE_E164',
    DEFAULT_DRIVER_PHONE,
  );

  assertPhone('DEV_SEED_ADMIN_PHONE_E164', adminPhone);
  assertPhone('DEV_SEED_PASSENGER_PHONE_E164', passengerPhone);
  assertPhone('DEV_SEED_DRIVER_PHONE_E164', driverPhone);

  const uniquePhones = new Set([adminPhone, passengerPhone, driverPhone]);
  if (uniquePhones.size !== 3) {
    throw new Error('Los teléfonos del seed deben ser diferentes');
  }

  const admin = await upsertUser(
    manager,
    adminPhone,
    UserRole.SUPER_ADMIN,
    passwordHash,
  );
  const passenger = await upsertUser(
    manager,
    passengerPhone,
    UserRole.PASSENGER,
    passwordHash,
  );
  const driver = await upsertUser(
    manager,
    driverPhone,
    UserRole.DRIVER,
    passwordHash,
  );

  return { admin, passenger, driver };
}

async function seedPassenger(
  manager: EntityManager,
  passengerUserId: string,
): Promise<PassengerProfile> {
  const repository = manager.getRepository(PassengerProfile);
  const existing = await repository.findOne({
    where: { userId: passengerUserId },
  });
  const profile =
    existing ??
    repository.create({
      userId: passengerUserId,
    });

  Object.assign(profile, {
    firstName: 'Pasajero',
    lastName: 'Pruebas',
    photoUrl: null,
    emergencyContactName: 'Contacto de pruebas',
    emergencyContactPhoneE164: '+51900000003',
  });

  return repository.save(profile);
}

async function seedDriverProfile(
  manager: EntityManager,
  driverUserId: string,
  adminUserId: string,
): Promise<DriverProfile> {
  const repository = manager.getRepository(DriverProfile);
  const existing = await repository.findOne({
    where: { userId: driverUserId },
  });
  const now = new Date();
  const profile =
    existing ??
    repository.create({
      userId: driverUserId,
    });

  Object.assign(profile, {
    firstName: 'Conductor',
    lastName: 'Pruebas',
    documentType: IdentityDocumentType.DNI,
    documentNumber: DRIVER_DOCUMENT_NUMBER,
    birthDate: '1990-01-15',
    address: 'Tarapoto, San Martín',
    photoUrl: 'https://example.test/driver/profile.jpg',
    status: DriverStatus.APPROVED,
    rejectionReason: null,
    submittedAt: profile.submittedAt ?? now,
    approvedAt: profile.approvedAt ?? now,
    approvedByUserId: adminUserId,
    suspensionReason: null,
    suspendedAt: null,
    suspendedByUserId: null,
  });

  return repository.save(profile);
}

async function seedVehicle(
  manager: EntityManager,
  driverProfileId: string,
): Promise<void> {
  const repository = manager.getRepository(DriverVehicle);
  const existing = await repository.findOne({
    where: { driverProfileId },
  });
  const vehicle =
    existing ??
    repository.create({
      driverProfileId,
    });

  Object.assign(vehicle, {
    plate: 'DEV-002',
    brand: 'Honda',
    model: 'Tuki Dev',
    year: 2025,
    color: 'Azul',
    engineNumber: 'DEV-ENGINE-0002',
    chassisNumber: 'DEV-CHASSIS-0002',
    vehicleType: VehicleType.MOTOTAXI,
    status: VehicleStatus.APPROVED,
    rejectionReason: null,
  });

  await repository.save(vehicle);
}

function documentFixture(type: DriverDocumentType): {
  fileUrl: string;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
} {
  const slug = type.toLowerCase().replaceAll('_', '-');

  switch (type) {
    case DriverDocumentType.DRIVER_LICENSE:
      return {
        fileUrl: `https://example.test/driver/${slug}.jpg`,
        documentNumber: 'LIC-DEV-0002',
        issuedAt: '2025-01-01',
        expiresAt: '2035-01-01',
      };
    case DriverDocumentType.SOAT:
      return {
        fileUrl: `https://example.test/driver/${slug}.jpg`,
        documentNumber: 'SOAT-DEV-0002',
        issuedAt: '2026-01-01',
        expiresAt: '2035-01-01',
      };
    case DriverDocumentType.VEHICLE_REGISTRATION:
      return {
        fileUrl: `https://example.test/driver/${slug}.jpg`,
        documentNumber: 'REG-DEV-0002',
        issuedAt: '2025-01-01',
        expiresAt: null,
      };
    default:
      return {
        fileUrl: `https://example.test/driver/${slug}.jpg`,
        documentNumber: null,
        issuedAt: null,
        expiresAt: null,
      };
  }
}

async function seedDriverDocuments(
  manager: EntityManager,
  driverProfileId: string,
  adminUserId: string,
): Promise<void> {
  const repository = manager.getRepository(DriverDocument);
  const now = new Date();

  for (const type of Object.values(DriverDocumentType)) {
    const existing = await repository.findOne({
      where: { driverProfileId, type },
    });
    const document =
      existing ??
      repository.create({
        driverProfileId,
        type,
      });

    Object.assign(document, {
      ...documentFixture(type),
      status: DriverDocumentStatus.APPROVED,
      rejectionReason: null,
      reviewedAt: document.reviewedAt ?? now,
      reviewedByUserId: adminUserId,
    });

    await repository.save(document);
  }
}

async function seedOperationalState(
  manager: EntityManager,
  driverProfileId: string,
): Promise<void> {
  const repository = manager.getRepository(DriverOperationalState);
  const existing = await repository.findOne({
    where: { driverProfileId },
  });

  if (existing) {
    return;
  }

  await repository.save(
    repository.create({
      driverProfileId,
      status: DriverOperationalStatus.OFFLINE,
      connectedAt: null,
      disconnectedAt: new Date(),
      lastSeenAt: null,
    }),
  );
}

async function seedDriverLocation(
  manager: EntityManager,
  driverProfileId: string,
): Promise<void> {
  const repository = manager.getRepository(DriverLocation);
  const existing = await repository.findOne({
    where: { driverProfileId },
  });

  if (existing) {
    return;
  }

  await repository.save(
    repository.create({
      driverProfileId,
      position: {
        type: 'Point',
        coordinates: [TARAPOTO_CENTER.longitude, TARAPOTO_CENTER.latitude],
      },
      latitude: TARAPOTO_CENTER.latitude,
      longitude: TARAPOTO_CENTER.longitude,
      heading: 0,
      speed: 0,
      accuracy: 5,
      recordedAt: new Date(),
    }),
  );
}

async function seedServiceZone(manager: EntityManager): Promise<ServiceZone> {
  const repository = manager.getRepository(ServiceZone);
  const existing = await repository.findOne({
    where: { code: SERVICE_ZONE_CODE },
  });
  const zone =
    existing ??
    repository.create({
      code: SERVICE_ZONE_CODE,
    });

  Object.assign(zone, {
    name: 'Tarapoto desarrollo',
    description: 'Zona operativa idempotente para desarrollo y pruebas',
    boundary: TARAPOTO_BOUNDARY,
    status: ServiceZoneStatus.ACTIVE,
    priority: 100,
  });

  return repository.save(zone);
}

async function seedFareRule(
  manager: EntityManager,
  serviceZoneId: string,
): Promise<FareRule> {
  const repository = manager.getRepository(FareRule);
  const existing = await repository.findOne({
    where: {
      serviceZoneId,
      name: FARE_RULE_NAME,
    },
  });
  const rule =
    existing ??
    repository.create({
      serviceZoneId,
      name: FARE_RULE_NAME,
    });

  Object.assign(rule, {
    baseFare: '2.00',
    minimumFare: '3.00',
    pricePerKm: '1.2000',
    pricePerMinute: '0.1000',
    bookingFee: '0.50',
    waitingPricePerMinute: '0.1000',
    cancellationFee: '1.00',
    nightMultiplier: '1.150',
    rainMultiplier: '1.100',
    currency: 'PEN',
    status: FareRuleStatus.ACTIVE,
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    effectiveUntil: null,
  });

  return repository.save(rule);
}

export async function seedDevelopmentData(
  dataSource: DataSource,
): Promise<SeedResult> {
  assertDevelopmentSeedEnvironment();

  const password = environmentValue('DEV_SEED_PASSWORD', DEFAULT_PASSWORD);
  assertPassword(password);
  const passwordHash = await hash(password, 10);

  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'tukituki-development-data-seed',
    ]);

    const users = await seedUsers(manager, passwordHash);
    await seedPassenger(manager, users.passenger.id);
    const driverProfile = await seedDriverProfile(
      manager,
      users.driver.id,
      users.admin.id,
    );
    await seedVehicle(manager, driverProfile.id);
    await seedDriverDocuments(manager, driverProfile.id, users.admin.id);
    await seedOperationalState(manager, driverProfile.id);
    await seedDriverLocation(manager, driverProfile.id);
    const serviceZone = await seedServiceZone(manager);
    const fareRule = await seedFareRule(manager, serviceZone.id);

    return {
      adminUserId: users.admin.id,
      passengerUserId: users.passenger.id,
      driverUserId: users.driver.id,
      driverProfileId: driverProfile.id,
      serviceZoneId: serviceZone.id,
      fareRuleId: fareRule.id,
    };
  });
}

async function run(): Promise<void> {
  assertDevelopmentSeedEnvironment();
  await AppDataSource.initialize();

  try {
    const result = await seedDevelopmentData(AppDataSource);
    const password = environmentValue('DEV_SEED_PASSWORD', DEFAULT_PASSWORD);

    logger.log(`Datos operativos listos: ${JSON.stringify(result)}`);
    logger.warn(
      `Credenciales locales: admin=${environmentValue(
        'DEV_SEED_ADMIN_PHONE_E164',
        DEFAULT_ADMIN_PHONE,
      )}, pasajero=${environmentValue(
        'DEV_SEED_PASSENGER_PHONE_E164',
        DEFAULT_PASSENGER_PHONE,
      )}, conductor=${environmentValue(
        'DEV_SEED_DRIVER_PHONE_E164',
        DEFAULT_DRIVER_PHONE,
      )}, password=${password}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';

    logger.error(message);
    process.exitCode = 1;
  });
}
