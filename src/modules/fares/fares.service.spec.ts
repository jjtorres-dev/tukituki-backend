import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { FareQuote } from './entities/fare-quote.entity';
import { FareRule } from './entities/fare-rule.entity';
import { FareQuoteStatus } from './enums/fare-quote-status.enum';
import { FareRuleStatus } from './enums/fare-rule-status.enum';
import { FaresService } from './fares.service';
import { GoogleRoutesService } from './google-routes.service';

type QueryBuilderMock<T> = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  setLock: jest.Mock;
  getOne: jest.Mock<Promise<T | null>, []>;
};

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder = {} as QueryBuilderMock<T>;

  queryBuilder.where = jest.fn(() => queryBuilder);

  queryBuilder.andWhere = jest.fn(() => queryBuilder);

  queryBuilder.orderBy = jest.fn(() => queryBuilder);

  queryBuilder.addOrderBy = jest.fn(() => queryBuilder);

  queryBuilder.setLock = jest.fn(() => queryBuilder);

  queryBuilder.getOne = jest.fn<Promise<T | null>, []>(() =>
    Promise.resolve(null),
  );

  return queryBuilder;
}

describe('FaresService', () => {
  let service: FaresService;

  let userQueryBuilder: QueryBuilderMock<User>;

  let zoneQueryBuilder: QueryBuilderMock<ServiceZone>;

  let fareRuleQueryBuilder: QueryBuilderMock<FareRule>;

  let savedQuote: FareQuote | undefined;

  const googleRoutesServiceMock = {
    computeRoute: jest.fn(),
  };

  const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const passenger: User = {
    id: passengerUserId,

    phoneE164: '+51987654321',

    roles: [UserRole.PASSENGER],

    status: UserStatus.ACTIVE,

    isPhoneVerified: false,

    createdAt: new Date(),

    updatedAt: new Date(),
  } as User;

  const originZone: ServiceZone = {
    id: '7d37cc0a-bbbe-4cd1-a244-b8eca8350012',

    name: 'Tarapoto Centro',

    code: 'TARAPOTO_CENTRO',

    status: ServiceZoneStatus.ACTIVE,
  } as ServiceZone;

  const destinationZone: ServiceZone = {
    ...originZone,

    id: '1d2edb48-b408-46b5-b312-44e89acd2bb4',

    name: 'Morales',

    code: 'MORALES',
  };

  const fareRule: FareRule = {
    id: 'd2e188bd-681a-4f19-9d47-f4b6526ef311',

    serviceZoneId: originZone.id,

    name: 'Tarifa estándar Tarapoto',

    baseFare: '2.50',

    minimumFare: '5.00',

    pricePerKm: '1.0000',

    pricePerMinute: '0.1000',

    bookingFee: '0.50',

    waitingPricePerMinute: '0.1000',

    cancellationFee: '2.00',

    nightMultiplier: '1.150',

    rainMultiplier: '1.100',

    currency: 'PEN',

    status: FareRuleStatus.ACTIVE,

    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),

    effectiveUntil: null,
  } as FareRule;

  beforeEach(async () => {
    savedQuote = undefined;

    googleRoutesServiceMock.computeRoute.mockReset();

    googleRoutesServiceMock.computeRoute.mockResolvedValue({
      distanceMeters: 3200,

      durationSeconds: 720,
    });

    userQueryBuilder = createQueryBuilderMock<User>();

    zoneQueryBuilder = createQueryBuilderMock<ServiceZone>();

    fareRuleQueryBuilder = createQueryBuilderMock<FareRule>();

    const userRepository = {
      createQueryBuilder: jest.fn(() => userQueryBuilder),
    };

    const zoneRepository = {
      createQueryBuilder: jest.fn(() => zoneQueryBuilder),
    };

    const fareRuleRepository = {
      createQueryBuilder: jest.fn(() => fareRuleQueryBuilder),
    };

    const quoteRepository = {
      create: jest.fn(
        (input: Partial<FareQuote>): FareQuote => input as FareQuote,
      ),

      save: jest.fn((quote: FareQuote): Promise<FareQuote> => {
        savedQuote = {
          ...quote,

          id: quote.id ?? '1f66359e-d183-494d-a921-a19edbfbe2b9',

          createdAt: quote.createdAt ?? new Date(),

          updatedAt: quote.updatedAt ?? new Date(),
        };

        return Promise.resolve(savedQuote);
      }),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === User) {
          return userRepository;
        }

        if (entity === ServiceZone) {
          return zoneRepository;
        }

        if (entity === FareRule) {
          return fareRuleRepository;
        }

        if (entity === FareQuote) {
          return quoteRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaresService,

        {
          provide: DataSource,

          useValue: dataSourceMock,
        },

        {
          provide: GoogleRoutesService,

          useValue: googleRoutesServiceMock,
        },
      ],
    }).compile();

    service = module.get<FaresService>(FaresService);

    userQueryBuilder.getOne.mockResolvedValue({
      ...passenger,

      roles: [...passenger.roles],
    });

    zoneQueryBuilder.getOne
      .mockResolvedValueOnce({
        ...originZone,
      })
      .mockResolvedValueOnce({
        ...destinationZone,
      });

    fareRuleQueryBuilder.getOne.mockResolvedValue({
      ...fareRule,
    });
  });

  it('debe persistir una cotización con métricas obtenidas desde Google Routes', async () => {
    const before = Date.now();

    const origin = {
      latitude: -6.4877,

      longitude: -76.3599,

      address: 'Jr. Lima 250, Tarapoto',
    };

    const destination = {
      latitude: -6.4812,

      longitude: -76.3655,

      address: 'Plaza de Armas de Morales',
    };

    const result = await service.estimate(passengerUserId, {
      origin,
      destination,
    });

    expect(googleRoutesServiceMock.computeRoute).toHaveBeenCalledWith(
      origin,
      destination,
    );

    expect(savedQuote).toBeDefined();

    expect(savedQuote?.passengerUserId).toBe(passengerUserId);

    expect(savedQuote?.status).toBe(FareQuoteStatus.ACTIVE);

    expect(savedQuote?.originPosition.coordinates).toEqual([-76.3599, -6.4877]);

    expect(savedQuote?.distanceMeters).toBe(3200);

    expect(savedQuote?.durationSeconds).toBe(720);

    expect(savedQuote?.estimatedFare).toBe('7.40');

    expect(result.quoteId).toBe(savedQuote?.id);

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 299000);

    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(before + 301000);
  });

  it('debe ignorar métricas heredadas enviadas por Passenger', async () => {
    googleRoutesServiceMock.computeRoute.mockResolvedValue({
      distanceMeters: 3200,

      durationSeconds: 720,
    });

    const result = await service.estimate(passengerUserId, {
      origin: {
        latitude: -6.4877,

        longitude: -76.3599,

        address: 'Origen',
      },

      destination: {
        latitude: -6.4812,

        longitude: -76.3655,

        address: 'Destino',
      },

      // El cliente intenta enviar
      // métricas diferentes.
      // El backend debe ignorarlas.
      distanceMeters: 99999,

      durationSeconds: 1,
    });

    expect(savedQuote?.distanceMeters).toBe(3200);

    expect(savedQuote?.durationSeconds).toBe(720);

    expect(result.estimatedFare).toBe('7.40');
  });

  it('debe respetar la tarifa mínima', async () => {
    googleRoutesServiceMock.computeRoute.mockResolvedValue({
      distanceMeters: 100,

      durationSeconds: 60,
    });

    fareRuleQueryBuilder.getOne.mockResolvedValue({
      ...fareRule,

      minimumFare: '10.00',
    });

    const result = await service.estimate(passengerUserId, {
      origin: {
        latitude: -6.4877,

        longitude: -76.3599,

        address: 'Jr. Lima 250, Tarapoto',
      },

      destination: {
        latitude: -6.4812,

        longitude: -76.3655,

        address: 'Plaza de Armas de Morales',
      },
    });

    expect(result.estimatedFare).toBe('10.00');
  });

  it('debe aplicar multiplicadores nocturno y lluvia', async () => {
    const result = await service.estimate(passengerUserId, {
      origin: {
        latitude: -6.4877,

        longitude: -76.3599,

        address: 'Jr. Lima 250, Tarapoto',
      },

      destination: {
        latitude: -6.4812,

        longitude: -76.3655,

        address: 'Plaza de Armas de Morales',
      },

      isNight: true,

      isRaining: true,
    });

    expect(result.adjustmentMultiplier).toBe('1.265');

    expect(result.estimatedFare).toBe('9.36');
  });

  it('debe rechazar un origen fuera de cobertura sin consultar Google Routes', async () => {
    zoneQueryBuilder.getOne
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...destinationZone,
      });

    await expect(
      service.estimate(passengerUserId, {
        origin: {
          latitude: -7,

          longitude: -77,

          address: 'Origen fuera de cobertura',
        },

        destination: {
          latitude: -6.4812,

          longitude: -76.3655,

          address: 'Plaza de Armas de Morales',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(googleRoutesServiceMock.computeRoute).not.toHaveBeenCalled();
  });

  it('debe rechazar una cuenta de pasajero suspendida sin consultar Google Routes', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      ...passenger,

      status: UserStatus.SUSPENDED,
    });

    await expect(
      service.estimate(passengerUserId, {
        origin: {
          latitude: -6.4877,

          longitude: -76.3599,

          address: 'Jr. Lima 250, Tarapoto',
        },

        destination: {
          latitude: -6.4812,

          longitude: -76.3655,

          address: 'Plaza de Armas de Morales',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(googleRoutesServiceMock.computeRoute).not.toHaveBeenCalled();
  });
});
