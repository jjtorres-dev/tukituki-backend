import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { ServiceZonesService } from '../service-zones/service-zones.service';
import { FareRule } from './entities/fare-rule.entity';
import { FareRuleStatus } from './enums/fare-rule-status.enum';
import { FaresService } from './fares.service';

type QueryBuilderMock = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  getOne: jest.Mock<Promise<FareRule | null>, []>;
};

function createQueryBuilderMock(): QueryBuilderMock {
  const queryBuilder = {} as QueryBuilderMock;

  queryBuilder.where = jest.fn(() => queryBuilder);
  queryBuilder.andWhere = jest.fn(() => queryBuilder);
  queryBuilder.orderBy = jest.fn(() => queryBuilder);
  queryBuilder.getOne = jest.fn<Promise<FareRule | null>, []>(() =>
    Promise.resolve(null),
  );

  return queryBuilder;
}

describe('FaresService', () => {
  let service: FaresService;
  let queryBuilder: QueryBuilderMock;
  let findActiveZoneForPoint: jest.Mock<
    Promise<ServiceZone | null>,
    [number, number]
  >;

  const zone: ServiceZone = {
    id: '7d37cc0a-bbbe-4cd1-a244-b8eca8350012',
    name: 'Tarapoto Centro',
    code: 'TARAPOTO_CENTRO',
    status: ServiceZoneStatus.ACTIVE,
  } as ServiceZone;

  const fareRule: FareRule = {
    id: 'd2e188bd-681a-4f19-9d47-f4b6526ef311',
    serviceZoneId: zone.id,
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
    queryBuilder = createQueryBuilderMock();

    const fareRuleRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    const dataSourceMock = {
      getRepository: jest.fn(() => fareRuleRepository),
    };

    findActiveZoneForPoint = jest.fn<
      Promise<ServiceZone | null>,
      [number, number]
    >(() => Promise.resolve(zone));

    const serviceZonesServiceMock = {
      findActiveZoneForPoint,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaresService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: ServiceZonesService,
          useValue: serviceZonesServiceMock,
        },
      ],
    }).compile();

    service = module.get<FaresService>(FaresService);

    queryBuilder.getOne.mockResolvedValue({
      ...fareRule,
    });
  });

  it('debe calcular distancia, tiempo y cargo de reserva', async () => {
    const result = await service.estimate({
      origin: {
        latitude: -6.4877,
        longitude: -76.3599,
      },
      destination: {
        latitude: -6.4812,
        longitude: -76.3655,
      },
      distanceMeters: 3200,
      durationSeconds: 720,
    });

    expect(result.distanceAmount).toBe('3.20');
    expect(result.timeAmount).toBe('1.20');
    expect(result.subtotal).toBe('7.40');
    expect(result.estimatedFare).toBe('7.40');
  });

  it('debe respetar la tarifa mínima', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ...fareRule,
      minimumFare: '10.00',
    });

    const result = await service.estimate({
      origin: {
        latitude: -6.4877,
        longitude: -76.3599,
      },
      destination: {
        latitude: -6.4812,
        longitude: -76.3655,
      },
      distanceMeters: 100,
      durationSeconds: 60,
    });

    expect(result.estimatedFare).toBe('10.00');
  });

  it('debe aplicar multiplicadores nocturno y lluvia', async () => {
    const result = await service.estimate({
      origin: {
        latitude: -6.4877,
        longitude: -76.3599,
      },
      destination: {
        latitude: -6.4812,
        longitude: -76.3655,
      },
      distanceMeters: 3200,
      durationSeconds: 720,
      isNight: true,
      isRaining: true,
    });

    expect(result.adjustmentMultiplier).toBe('1.265');
    expect(result.estimatedFare).toBe('9.36');
  });

  it('debe rechazar un origen fuera de cobertura', async () => {
    findActiveZoneForPoint
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(zone);

    await expect(
      service.estimate({
        origin: {
          latitude: -7,
          longitude: -77,
        },
        destination: {
          latitude: -6.4812,
          longitude: -76.3655,
        },
        distanceMeters: 3200,
        durationSeconds: 720,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
