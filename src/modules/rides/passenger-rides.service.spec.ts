import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager, FindOneOptions } from 'typeorm';

import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareRule } from '../fares/entities/fare-rule.entity';
import { FareQuoteStatus } from '../fares/enums/fare-quote-status.enum';
import { FareRuleStatus } from '../fares/enums/fare-rule-status.enum';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Ride } from './entities/ride.entity';
import { RideCancellationActor } from './enums/ride-cancellation-actor.enum';
import { RideStatus } from './enums/ride-status.enum';
import { PassengerRidesService } from './passenger-rides.service';

type RepositoryMock<T> = {
  findOne: jest.Mock<Promise<T | null>, [FindOneOptions<T>]>;
  create: jest.Mock<T, [Partial<T>]>;
  save: jest.Mock<Promise<T>, [T]>;
};

describe('PassengerRidesService', () => {
  let service: PassengerRidesService;
  let userRepository: RepositoryMock<User>;
  let quoteRepository: RepositoryMock<FareQuote>;
  let zoneRepository: RepositoryMock<ServiceZone>;
  let fareRuleRepository: RepositoryMock<FareRule>;
  let rideRepository: RepositoryMock<Ride>;
  let savedQuote: FareQuote | undefined;
  let savedRide: Ride | undefined;

  const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const quoteId = '1f66359e-d183-494d-a921-a19edbfbe2b9';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const originZoneId = '7d37cc0a-bbbe-4cd1-a244-b8eca8350012';
  const destinationZoneId = '1d2edb48-b408-46b5-b312-44e89acd2bb4';
  const fareRuleId = 'd2e188bd-681a-4f19-9d47-f4b6526ef311';

  const passenger: User = {
    id: passengerUserId,
    phoneE164: '+51987654321',
    roles: [UserRole.PASSENGER],
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const quote: FareQuote = {
    id: quoteId,
    passengerUserId,
    fareRuleId,
    originZoneId,
    destinationZoneId,
    originPosition: {
      type: 'Point',
      coordinates: [-76.3599, -6.4877],
    },
    destinationPosition: {
      type: 'Point',
      coordinates: [-76.3655, -6.4812],
    },
    originAddress: 'Jr. Lima 250, Tarapoto',
    destinationAddress: 'Plaza de Armas de Morales',
    distanceMeters: 3200,
    durationSeconds: 720,
    baseFare: '2.50',
    distanceAmount: '3.20',
    timeAmount: '1.20',
    bookingFee: '0.50',
    subtotal: '7.40',
    adjustmentMultiplier: '1.000',
    estimatedFare: '7.40',
    currency: 'PEN',
    isNight: false,
    isRaining: false,
    status: FareQuoteStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 300000),
    usedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as FareQuote;

  const zone: ServiceZone = {
    id: originZoneId,
    name: 'Tarapoto Centro',
    code: 'TARAPOTO_CENTRO',
    status: ServiceZoneStatus.ACTIVE,
  } as ServiceZone;

  const fareRule: FareRule = {
    id: fareRuleId,
    serviceZoneId: originZoneId,
    status: FareRuleStatus.ACTIVE,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveUntil: null,
  } as FareRule;

  const searchingRide: Ride = {
    id: rideId,
    passengerUserId,
    driverProfileId: null,
    fareQuoteId: quoteId,
    originZoneId,
    destinationZoneId,
    originPosition: quote.originPosition,
    destinationPosition: quote.destinationPosition,
    originAddress: quote.originAddress,
    destinationAddress: quote.destinationAddress,
    distanceMeters: quote.distanceMeters,
    estimatedDurationSeconds: quote.durationSeconds,
    estimatedFare: quote.estimatedFare,
    finalFare: null,
    currency: quote.currency,
    status: RideStatus.SEARCHING_DRIVER,
    passengerNotes: null,
    requestedAt: new Date(),
    searchExpiresAt: new Date(Date.now() + 120000),
    driverAssignedAt: null,
    driverArrivedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    cancelledBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Ride;

  function createRepositoryMock<T>(): RepositoryMock<T> {
    return {
      findOne: jest.fn<Promise<T | null>, [FindOneOptions<T>]>(() =>
        Promise.resolve(null),
      ),
      create: jest.fn<T, [Partial<T>]>((input: Partial<T>): T => input as T),
      save: jest.fn<Promise<T>, [T]>((entity: T): Promise<T> =>
        Promise.resolve(entity),
      ),
    };
  }

  beforeEach(async () => {
    savedQuote = undefined;
    savedRide = undefined;
    userRepository = createRepositoryMock<User>();
    quoteRepository = createRepositoryMock<FareQuote>();
    zoneRepository = createRepositoryMock<ServiceZone>();
    fareRuleRepository = createRepositoryMock<FareRule>();
    rideRepository = createRepositoryMock<Ride>();

    userRepository.findOne.mockResolvedValue({
      ...passenger,
      roles: [...passenger.roles],
    });
    quoteRepository.findOne.mockResolvedValue({
      ...quote,
      expiresAt: new Date(Date.now() + 300000),
    });
    zoneRepository.findOne.mockResolvedValue({ ...zone });
    fareRuleRepository.findOne.mockResolvedValue({ ...fareRule });
    rideRepository.findOne.mockResolvedValue(null);

    quoteRepository.save.mockImplementation(
      (entity: FareQuote): Promise<FareQuote> => {
        savedQuote = entity;
        return Promise.resolve(entity);
      },
    );
    rideRepository.save.mockImplementation((entity: Ride): Promise<Ride> => {
      savedRide = {
        ...entity,
        id: entity.id ?? rideId,
        createdAt: entity.createdAt ?? new Date(),
        updatedAt: entity.updatedAt ?? new Date(),
      };
      return Promise.resolve(savedRide);
    });

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === User) {
          return userRepository;
        }

        if (entity === FareQuote) {
          return quoteRepository;
        }

        if (entity === ServiceZone) {
          return zoneRepository;
        }

        if (entity === FareRule) {
          return fareRuleRepository;
        }

        if (entity === Ride) {
          return rideRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return rideRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassengerRidesService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<PassengerRidesService>(PassengerRidesService);
  });

  it('debe crear el viaje copiando los datos inmutables de la cotización', async () => {
    const result = await service.createRide(passengerUserId, {
      fareQuoteId: quoteId,
      passengerNotes: 'Estoy frente a la puerta principal',
    });

    expect(savedRide).toBeDefined();
    expect(savedRide?.status).toBe(RideStatus.SEARCHING_DRIVER);
    expect(savedRide?.estimatedFare).toBe('7.40');
    expect(savedRide?.originPosition).toEqual(quote.originPosition);
    expect(savedRide?.passengerNotes).toBe(
      'Estoy frente a la puerta principal',
    );
    expect(savedQuote?.status).toBe(FareQuoteStatus.USED);
    expect(savedQuote?.usedAt).toBeInstanceOf(Date);
    expect(result.id).toBe(rideId);
  });

  it('debe marcar una cotización vencida como EXPIRED', async () => {
    quoteRepository.findOne.mockResolvedValue({
      ...quote,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.createRide(passengerUserId, {
        fareQuoteId: quoteId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(savedQuote?.status).toBe(FareQuoteStatus.EXPIRED);
    expect(rideRepository.save).not.toHaveBeenCalled();
  });

  it('debe ocultar una cotización perteneciente a otro pasajero', async () => {
    quoteRepository.findOne.mockResolvedValue({
      ...quote,
      passengerUserId: '381f6711-a5ca-4cc5-9107-3f94a6e0b649',
    });

    await expect(
      service.createRide(passengerUserId, {
        fareQuoteId: quoteId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('debe rechazar una cotización ya utilizada', async () => {
    quoteRepository.findOne.mockResolvedValue({
      ...quote,
      status: FareQuoteStatus.USED,
    });

    await expect(
      service.createRide(passengerUserId, {
        fareQuoteId: quoteId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe impedir dos viajes activos para el mismo pasajero', async () => {
    rideRepository.findOne.mockResolvedValue({ ...searchingRide });

    await expect(
      service.createRide(passengerUserId, {
        fareQuoteId: quoteId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(quoteRepository.save).not.toHaveBeenCalled();
  });

  it('debe consultar el viaje activo del pasajero', async () => {
    rideRepository.findOne.mockResolvedValue({ ...searchingRide });

    const result = await service.getActiveRide(passengerUserId);

    expect(result.id).toBe(rideId);
    expect(result.status).toBe(RideStatus.SEARCHING_DRIVER);
  });

  it('debe rechazar la consulta cuando no hay viaje activo', async () => {
    await expect(service.getActiveRide(passengerUserId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('debe consultar el detalle de un viaje propio', async () => {
    rideRepository.findOne.mockResolvedValue({ ...searchingRide });

    const result = await service.getRide(passengerUserId, rideId);

    expect(result.id).toBe(rideId);
    expect(result.fareQuoteId).toBe(quoteId);
  });

  it('debe ocultar un viaje que no pertenece al pasajero', async () => {
    rideRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getRide(passengerUserId, rideId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('debe liberar una búsqueda vencida antes de crear otro viaje', async () => {
    rideRepository.findOne.mockResolvedValue({
      ...searchingRide,
      searchExpiresAt: new Date(Date.now() - 1000),
    });

    const result = await service.createRide(passengerUserId, {
      fareQuoteId: quoteId,
    });

    expect(result.status).toBe(RideStatus.SEARCHING_DRIVER);
    expect(rideRepository.save).toHaveBeenCalledTimes(2);
  });

  it('debe cancelar un viaje que está buscando conductor', async () => {
    rideRepository.findOne.mockResolvedValue({ ...searchingRide });

    const result = await service.cancelRide(passengerUserId, rideId, {
      reason: 'Ya no necesito el viaje',
    });

    expect(savedRide?.status).toBe(RideStatus.CANCELLED);
    expect(savedRide?.cancelledBy).toBe(RideCancellationActor.PASSENGER);
    expect(savedRide?.cancelledAt).toBeInstanceOf(Date);
    expect(result.status).toBe(RideStatus.CANCELLED);
  });

  it('debe impedir cancelar un viaje en progreso', async () => {
    rideRepository.findOne.mockResolvedValue({
      ...searchingRide,
      status: RideStatus.IN_PROGRESS,
    });

    await expect(
      service.cancelRide(passengerUserId, rideId, {
        reason: 'Quiero cancelar el viaje',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe expirar una búsqueda vencida', async () => {
    rideRepository.findOne.mockResolvedValue({
      ...searchingRide,
      searchExpiresAt: new Date(Date.now() - 1000),
    });

    const result = await service.expireSearchingRide(rideId);

    expect(result).toBe(true);
    expect(savedRide?.status).toBe(RideStatus.EXPIRED);
  });
});
