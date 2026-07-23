import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { RideRating } from './entities/ride-rating.entity';
import { Ride } from './entities/ride.entity';
import { RideRatingReviewerRole } from './enums/ride-rating-reviewer-role.enum';
import { RideRatingTag } from './enums/ride-rating-tag.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideRatingsService } from './ride-ratings.service';

function queryBuilderReturning<T>(value: T | null) {
  const builder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(() => Promise.resolve(value)),
  };
  builder.where.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);
  return builder;
}

describe('RideRatingsService', () => {
  it('debe permitir que el pasajero califique al conductor', async () => {
    const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
    const driverUserId = '80ba55dd-aae8-42d4-93af-a1e30217cc79';
    const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      passengerUserId,
      driverProfileId,
      status: RideStatus.COMPLETED,
    } as Ride;
    const driverProfile = {
      id: driverProfileId,
      userId: driverUserId,
      ratingAverage: '0.00',
      ratingCount: 0,
    } as DriverProfile;
    const createdAt = new Date('2026-07-23T16:00:00.000Z');
    const ratingRepository = {
      create: jest.fn(
        (value: Partial<RideRating>) =>
          ({
            id: '5ee8f00e-b75c-47fa-b0ad-f8fd31784704',
            createdAt,
            ...value,
          }) as RideRating,
      ),
      save: jest.fn((value: RideRating) => Promise.resolve(value)),
    };
    const driverRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(driverProfile)),
      save: jest.fn((value: DriverProfile) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return { findOne: jest.fn(() => Promise.resolve(ride)) };
        }
        if (entity === DriverProfile) return driverRepository;
        if (entity === RideRating) return ratingRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() =>
        Promise.resolve([{ ratingAverage: '5.00', ratingCount: 1 }]),
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
          work(manager as unknown as EntityManager),
      ),
    };
    const service = new RideRatingsService(dataSource as unknown as DataSource);

    const result = await service.rateDriver(passengerUserId, ride.id, {
      score: 5,
      comment: '  Excelente servicio  ',
      tags: [RideRatingTag.SAFE_DRIVING, RideRatingTag.FRIENDLY],
    });

    expect(result.reviewerRole).toBe(RideRatingReviewerRole.PASSENGER);
    expect(result.comment).toBe('Excelente servicio');
    expect(result.subjectRatingAverage).toBe('5.00');
    expect(driverProfile.ratingAverage).toBe('5.00');
    expect(driverProfile.ratingCount).toBe(1);
    expect(driverRepository.save).toHaveBeenCalledTimes(1);
  });

  it('debe permitir que el conductor califique al pasajero', async () => {
    const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
    const driverUserId = '80ba55dd-aae8-42d4-93af-a1e30217cc79';
    const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      passengerUserId,
      driverProfileId,
      status: RideStatus.COMPLETED,
    } as Ride;
    const driverProfile = {
      id: driverProfileId,
      userId: driverUserId,
    } as DriverProfile;
    const passengerProfile = {
      id: '9da676d7-1cd7-450f-b21a-a3c8108af9f1',
      userId: passengerUserId,
      ratingAverage: '4.00',
      ratingCount: 2,
    } as PassengerProfile;
    const ratingRepository = {
      create: jest.fn(
        (value: Partial<RideRating>) =>
          ({
            id: '5ee8f00e-b75c-47fa-b0ad-f8fd31784704',
            createdAt: new Date(),
            ...value,
          }) as RideRating,
      ),
      save: jest.fn((value: RideRating) => Promise.resolve(value)),
    };
    const passengerRepository = {
      createQueryBuilder: jest.fn(() =>
        queryBuilderReturning(passengerProfile),
      ),
      save: jest.fn((value: PassengerProfile) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return { findOne: jest.fn(() => Promise.resolve(ride)) };
        }
        if (entity === DriverProfile) {
          return {
            createQueryBuilder: jest.fn(() =>
              queryBuilderReturning(driverProfile),
            ),
          };
        }
        if (entity === PassengerProfile) return passengerRepository;
        if (entity === RideRating) return ratingRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() =>
        Promise.resolve([{ ratingAverage: '4.33', ratingCount: 3 }]),
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
          work(manager as unknown as EntityManager),
      ),
    };
    const service = new RideRatingsService(dataSource as unknown as DataSource);

    const result = await service.ratePassenger(driverUserId, ride.id, {
      score: 5,
      tags: [RideRatingTag.RESPECTFUL],
    });

    expect(result.reviewerRole).toBe(RideRatingReviewerRole.DRIVER);
    expect(result.subjectRatingCount).toBe(3);
    expect(passengerProfile.ratingAverage).toBe('4.33');
  });

  it('debe impedir calificar un viaje que no está completado', async () => {
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      status: RideStatus.IN_PROGRESS,
    } as Ride;
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(ride)),
      })),
    };
    const dataSource = {
      transaction: jest.fn(
        <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
          work(manager as unknown as EntityManager),
      ),
    };
    const service = new RideRatingsService(dataSource as unknown as DataSource);

    await expect(
      service.rateDriver('passenger-id', ride.id, { score: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('debe rechazar etiquetas que no corresponden al evaluador', async () => {
    const service = new RideRatingsService({} as DataSource);

    await expect(
      service.rateDriver('passenger-id', 'ride-id', {
        score: 5,
        tags: [RideRatingTag.RESPECTFUL],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
