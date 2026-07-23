import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { FareQuote } from '../fares/entities/fare-quote.entity';
import { RideFinalFare } from './entities/ride-final-fare.entity';
import { RideProgressMetrics } from './entities/ride-progress-metrics.entity';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideCompletionService } from './ride-completion.service';
import { RideTransitionsService } from './ride-transitions.service';

function queryBuilderReturning<T>(value: T) {
  const builder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(() => Promise.resolve(value)),
  };
  builder.where.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);
  return builder;
}

describe('RideCompletionService', () => {
  it('debe finalizar, calcular tarifa y liberar al conductor', async () => {
    const now = Date.now();
    const driverUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
    const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      fareQuoteId: '922c332a-54e9-4569-99cc-504381cee568',
      driverProfileId,
      status: RideStatus.IN_PROGRESS,
      stateVersion: 4,
      startedAt: new Date(now - 600_000),
      estimatedFare: '10.00',
      pricingBaseFare: '2.50',
      pricingMinimumFare: '4.00',
      pricingPricePerKm: '1.0000',
      pricingPricePerMinute: '0.1000',
      pricingBookingFee: '0.50',
      pricingAdjustmentMultiplier: '1.000',
      pricingCurrency: 'PEN',
      pricingCalculationVersion: 'fixed-decimal-v1',
    } as Ride;
    const profile = {
      id: driverProfileId,
      userId: driverUserId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const state = {
      driverProfileId,
      status: DriverOperationalStatus.BUSY,
    } as DriverOperationalState;
    const location = {
      driverProfileId,
      longitude: -76.3599,
      latitude: -6.4877,
      accuracy: 8,
      recordedAt: new Date(),
    } as DriverLocation;
    const metrics = {
      rideId: ride.id,
      trackedDistanceMeters: '3500.00',
      calculatedDurationSeconds: 0,
    } as RideProgressMetrics;
    const quote = {
      id: ride.fareQuoteId,
      fareRuleId: '2cb29790-59ad-4293-b3ca-c586503d14ed',
    } as FareQuote;
    const savedFinalFare: RideFinalFare[] = [];

    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
      save: jest.fn((value: Ride) => Promise.resolve(value)),
    };
    const profileRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(profile)),
    };
    const stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),
      save: jest.fn((value: DriverOperationalState) => Promise.resolve(value)),
    };
    const locationRepository = {
      findOne: jest.fn(() => Promise.resolve(location)),
    };
    const metricsRepository = {
      findOne: jest.fn(() => Promise.resolve(metrics)),
      save: jest.fn((value: RideProgressMetrics) => Promise.resolve(value)),
    };
    const quoteRepository = {
      findOne: jest.fn(() => Promise.resolve(quote)),
    };
    const finalFareRepository = {
      create: jest.fn(
        (value: Partial<RideFinalFare>) => value as RideFinalFare,
      ),
      save: jest.fn((value: RideFinalFare) => {
        savedFinalFare.push(value);
        return Promise.resolve({ id: 'fare-id', ...value });
      }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === DriverProfile) return profileRepository;
        if (entity === DriverOperationalState) return stateRepository;
        if (entity === DriverLocation) return locationRepository;
        if (entity === RideProgressMetrics) return metricsRepository;
        if (entity === FareQuote) return quoteRepository;
        if (entity === RideFinalFare) return finalFareRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() => Promise.resolve([{ distanceMeters: '25.50' }])),
    };
    const dataSource = {
      transaction: jest.fn(
        <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
          work(manager as unknown as EntityManager),
      ),
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return { findOne: jest.fn(() => Promise.resolve(profile)) };
        }
        if (entity === DriverVehicle) {
          return { findOne: jest.fn(() => Promise.resolve(null)) };
        }
        if (entity === DriverDocument) {
          return { find: jest.fn(() => Promise.resolve([])) };
        }
        throw new Error('Repositorio posterior inesperado');
      }),
    };
    const transitions = {
      transitionWithinTransaction: jest.fn(
        (
          _manager: EntityManager,
          target: Ride,
          status: RideStatus,
        ): Promise<void> => {
          target.status = status;
          target.stateVersion += 1;
          return Promise.resolve();
        },
      ),
    };
    const realtime = {
      emitStatusChanged: jest.fn(),
      emitCompleted: jest.fn(),
    };
    const availability = {
      publishAvailableDriver: jest.fn(() => Promise.resolve()),
      removeDriverAvailability: jest.fn(() => Promise.resolve()),
    };
    const config = {
      get: jest.fn(() => '20'),
    };
    const service = new RideCompletionService(
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
      transitions as unknown as RideTransitionsService,
      realtime as unknown as RideRealtimeService,
      availability as unknown as DriverAvailabilityRedisService,
    );

    const result = await service.completeRide(driverUserId, ride.id, {});

    expect(result.status).toBe(RideStatus.COMPLETED);
    expect(result.actualDistanceMeters).toBe(3500);
    expect(result.finalFare).toBe('7.50');
    expect(state.status).toBe(DriverOperationalStatus.AVAILABLE);
    expect(savedFinalFare).toHaveLength(1);
    expect(realtime.emitCompleted).toHaveBeenCalledTimes(1);
  });
});
