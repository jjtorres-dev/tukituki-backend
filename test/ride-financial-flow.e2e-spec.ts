import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import AppDataSource from '../src/database/data-source';
import { seedDevelopmentData } from '../src/database/seeds/development-data.seed';

import { CommissionPolicyService } from '../src/modules/commissions/commission-policy.service';
import { CommissionsService } from '../src/modules/commissions/commissions.service';
import { RideCommission } from '../src/modules/commissions/entities/ride-commission.entity';
import { CommissionCollectionMode } from '../src/modules/commissions/enums/commission-collection-mode.enum';
import { RideCommissionStatus } from '../src/modules/commissions/enums/ride-commission-status.enum';
import { DriverLocation } from '../src/modules/driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../src/modules/driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../src/modules/driver-operations/enums/driver-operational-status.enum';
import { FaresService } from '../src/modules/fares/fares.service';
import { DriverAvailabilityRedisService } from '../src/infrastructure/redis/driver-availability-redis.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { CashPaymentsService } from '../src/modules/payments/cash-payments.service';
import { PaymentMethod } from '../src/modules/payments/enums/payment-method.enum';
import { RidePaymentStatus } from '../src/modules/payments/enums/ride-payment-status.enum';
import { PassengerRidesService } from '../src/modules/rides/passenger-rides.service';
import { RideCompletionService } from '../src/modules/rides/ride-completion.service';
import { RideDispatchService } from '../src/modules/rides/ride-dispatch.service';
import { RideProgressMetrics } from '../src/modules/rides/entities/ride-progress-metrics.entity';
import { Ride } from '../src/modules/rides/entities/ride.entity';
import { RideStatus } from '../src/modules/rides/enums/ride-status.enum';
import { RideRealtimeService } from '../src/modules/rides/realtime/ride-realtime.service';
import { CancellationPolicyService } from '../src/modules/rides/cancellation-policy.service';
import { RideStartCodesService } from '../src/modules/rides/ride-start-codes.service';
import { RideTransitionsService } from '../src/modules/rides/ride-transitions.service';
import { RideViewService } from '../src/modules/rides/ride-view.service';
import { DriverSettlementsService } from '../src/modules/settlements/driver-settlements.service';
import { SettlementDirection } from '../src/modules/settlements/enums/settlement-direction.enum';
import { SettlementStatus } from '../src/modules/settlements/enums/settlement-status.enum';

interface DatabaseNameRow {
  databaseName: string;
}

interface ExtensionRow {
  extensionName: string;
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

describe('Flujo financiero real: cotización a liquidación', () => {
  let dataSource: DataSource;
  let faresService: FaresService;
  let passengerRidesService: PassengerRidesService;
  let rideCompletionService: RideCompletionService;
  let cashPaymentsService: CashPaymentsService;
  let settlementsService: DriverSettlementsService;
  let adminUserId: string;
  let passengerUserId: string;
  let driverUserId: string;
  let driverProfileId: string;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('El smoke financiero exige NODE_ENV=test');
    }

    dataSource = AppDataSource;
    await dataSource.initialize();

    const databaseResult: unknown = await dataSource.query(
      `SELECT current_database() AS "databaseName"`,
    );
    const databaseRows = databaseResult as DatabaseNameRow[];
    const databaseName = databaseRows[0]?.databaseName ?? '';

    if (!/(?:^|[_-])(test|smoke)(?:$|[_-])/i.test(databaseName)) {
      throw new Error(
        `La base ${databaseName} no parece desechable; usa un nombre con test o smoke`,
      );
    }

    await dataSource.destroy();
    runCompiledMigrations();
    await dataSource.initialize();

    const extensionResult: unknown = await dataSource.query(
      `SELECT extname AS "extensionName"
         FROM pg_extension
         WHERE extname IN ('postgis', 'uuid-ossp')
         ORDER BY extname`,
    );
    const extensions = extensionResult as ExtensionRow[];

    expect(extensions.map((row) => row.extensionName)).toEqual([
      'postgis',
      'uuid-ossp',
    ]);

    const seed = await seedDevelopmentData(dataSource);
    adminUserId = seed.adminUserId;
    passengerUserId = seed.passengerUserId;
    driverUserId = seed.driverUserId;
    driverProfileId = seed.driverProfileId;

    const configService = new ConfigService({
      RIDE_FINAL_FARE_MAX_INCREASE_PERCENT: '20',
    });
    const outboxService = new OutboxService(dataSource);
    const availabilityRedisService = {
      publishAvailableDriver: jest.fn().mockResolvedValue(undefined),
      removeDriverAvailability: jest.fn().mockResolvedValue(undefined),
    } as unknown as DriverAvailabilityRedisService;
    const realtimeService = {
      emitStatusChanged: jest.fn(),
      emitCompleted: jest.fn(),
    } as unknown as RideRealtimeService;
    const rideStartCodesService = {} as RideStartCodesService;
    const transitionsService = new RideTransitionsService(
      dataSource,
      availabilityRedisService,
      realtimeService,
      rideStartCodesService,
      outboxService,
    );
    const rideDispatchService = {
      dispatchRide: jest.fn().mockResolvedValue(undefined),
    } as unknown as RideDispatchService;
    const rideViewService = new RideViewService(dataSource);
    const cancellationPolicyService = new CancellationPolicyService(
      configService,
    );
    const commissionPolicyService = new CommissionPolicyService(dataSource);
    const commissionsService = new CommissionsService(
      dataSource,
      outboxService,
    );

    faresService = new FaresService(dataSource);
    passengerRidesService = new PassengerRidesService(
      dataSource,
      rideDispatchService,
      transitionsService,
      rideViewService,
      outboxService,
      cancellationPolicyService,
      commissionPolicyService,
    );
    rideCompletionService = new RideCompletionService(
      dataSource,
      configService,
      transitionsService,
      realtimeService,
      availabilityRedisService,
    );
    cashPaymentsService = new CashPaymentsService(
      dataSource,
      outboxService,
      commissionsService,
    );
    settlementsService = new DriverSettlementsService(
      dataSource,
      outboxService,
    );
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('cotiza, crea y completa el viaje, confirma efectivo y liquida la comisión', async () => {
    const quote = await faresService.estimate(passengerUserId, {
      origin: {
        latitude: -6.4865,
        longitude: -76.3599,
        address: 'Plaza de Armas de Tarapoto',
      },
      destination: {
        latitude: -6.4805,
        longitude: -76.3505,
        address: 'Destino smoke Tarapoto',
      },
      distanceMeters: 1800,
      durationSeconds: 540,
      isNight: false,
      isRaining: false,
    });
    expect(Number(quote.estimatedFare)).toBeGreaterThan(0);

    const createdRide = await passengerRidesService.createRide(
      passengerUserId,
      {
        fareQuoteId: quote.quoteId,
        paymentMethod: PaymentMethod.CASH,
        passengerNotes: 'Viaje financiero smoke',
      },
    );
    expect(createdRide.status).toBe(RideStatus.SEARCHING_DRIVER);

    const startedAt = new Date(Date.now() - 9 * 60 * 1000);
    await dataSource.transaction(async (manager) => {
      const rideRepository = manager.getRepository(Ride);
      const ride = await rideRepository.findOneByOrFail({
        id: createdRide.id,
      });
      ride.driverProfileId = driverProfileId;
      ride.status = RideStatus.IN_PROGRESS;
      ride.driverAssignedAt = startedAt;
      ride.driverArrivingAt = startedAt;
      ride.driverArrivedAt = startedAt;
      ride.startedAt = startedAt;
      ride.stateVersion += 4;
      await rideRepository.save(ride);

      const stateRepository = manager.getRepository(DriverOperationalState);
      const state = await stateRepository.findOneByOrFail({
        driverProfileId,
      });
      state.status = DriverOperationalStatus.BUSY;
      state.connectedAt = startedAt;
      state.disconnectedAt = null;
      state.lastSeenAt = new Date();
      await stateRepository.save(state);

      const locationRepository = manager.getRepository(DriverLocation);
      const location = await locationRepository.findOneByOrFail({
        driverProfileId,
      });
      location.position = {
        type: 'Point',
        coordinates: [-76.3505, -6.4805],
      };
      location.latitude = -6.4805;
      location.longitude = -76.3505;
      location.accuracy = 5;
      location.recordedAt = new Date();
      await locationRepository.save(location);

      const metricsRepository = manager.getRepository(RideProgressMetrics);
      await metricsRepository.save(
        metricsRepository.create({
          rideId: ride.id,
          acceptedSamples: 2,
          rejectedSamples: 0,
          trackedDistanceMeters: '1850.00',
          startedAt,
          lastReceivedSampleAt: new Date(),
          lastAcceptedSampleAt: new Date(),
          lastAcceptedSampleId: null,
          calculatedDurationSeconds: 0,
        }),
      );
    });

    const completion = await rideCompletionService.completeRide(
      driverUserId,
      createdRide.id,
      { completionNotes: 'Finalizado por smoke financiero' },
    );
    expect(completion.status).toBe(RideStatus.COMPLETED);
    expect(completion.paymentStatus).toBe(RidePaymentStatus.PENDING);
    expect(completion.paymentMethod).toBe(PaymentMethod.CASH);

    const payment = await cashPaymentsService.confirmCash(
      driverUserId,
      createdRide.id,
      {
        cashReceived: completion.passengerAmountDue,
        notes: 'Efectivo exacto recibido',
      },
    );
    expect(payment.status).toBe(RidePaymentStatus.PAID);
    expect(payment.changeGiven).toBe('0.00');

    const commissionRepository = dataSource.getRepository(RideCommission);
    const commission = await commissionRepository.findOneByOrFail({
      rideId: createdRide.id,
    });
    expect(commission.status).toBe(RideCommissionStatus.ACCRUED);
    expect(commission.collectionMode).toBe(
      CommissionCollectionMode.DRIVER_PAYABLE,
    );
    expect(commission.baseAmount).toBe(completion.finalFare);
    expect(Number(commission.commissionAmount)).toBeGreaterThan(0);

    commission.eligibleAt = new Date(Date.now() - 1_000);
    await commissionRepository.save(commission);

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000);
    const idempotencyKey = `smoke_${createdRide.id.replaceAll('-', '')}`;
    const settlement = await settlementsService.create(
      adminUserId,
      idempotencyKey,
      {
        driverProfileId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        notes: 'Liquidación generada por smoke financiero',
      },
    );

    expect(settlement.status).toBe(SettlementStatus.DRAFT);
    expect(settlement.direction).toBe(SettlementDirection.DRIVER_TO_PLATFORM);
    expect(settlement.rideCount).toBe(1);
    expect(settlement.cashCommissionAmount).toBe(commission.commissionAmount);
    expect(settlement.items).toHaveLength(1);
    expect(settlement.items[0]?.commissionId).toBe(commission.id);

    const approved = await settlementsService.approve(
      adminUserId,
      settlement.id,
      { notes: 'Aprobada automáticamente por smoke' },
    );
    expect(approved.status).toBe(SettlementStatus.APPROVED);

    const completedSettlement = await settlementsService.complete(
      adminUserId,
      settlement.id,
      {
        transferReference: `SMOKE-${createdRide.id}`,
        notes: 'Cierre automático del smoke',
      },
    );
    expect(completedSettlement.status).toBe(SettlementStatus.SETTLED);

    const settledCommission = await commissionRepository.findOneByOrFail({
      id: commission.id,
    });
    expect(settledCommission.status).toBe(RideCommissionStatus.SETTLED);
    expect(settledCommission.settledAt).not.toBeNull();
  }, 30_000);
});
