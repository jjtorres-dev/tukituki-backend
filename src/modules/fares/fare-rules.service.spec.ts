import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { FareRule } from './entities/fare-rule.entity';
import { FareRuleStatus } from './enums/fare-rule-status.enum';
import { FareRulesService } from './fare-rules.service';

type QueryBuilderMock<T> = {
  where: jest.Mock;
  andWhere: jest.Mock;
  setLock: jest.Mock;
  getOne: jest.Mock<Promise<T | null>, []>;
};

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder = {} as QueryBuilderMock<T>;

  queryBuilder.where = jest.fn(() => queryBuilder);
  queryBuilder.andWhere = jest.fn(() => queryBuilder);
  queryBuilder.setLock = jest.fn(() => queryBuilder);
  queryBuilder.getOne = jest.fn<Promise<T | null>, []>(() =>
    Promise.resolve(null),
  );

  return queryBuilder;
}

describe('FareRulesService', () => {
  let service: FareRulesService;
  let zoneQueryBuilder: QueryBuilderMock<ServiceZone>;
  let lockRuleQueryBuilder: QueryBuilderMock<FareRule>;
  let overlapQueryBuilder: QueryBuilderMock<FareRule>;

  const zone: ServiceZone = {
    id: '7d37cc0a-bbbe-4cd1-a244-b8eca8350012',
    name: 'Tarapoto Centro',
    code: 'TARAPOTO_CENTRO',
    status: ServiceZoneStatus.ACTIVE,
  } as ServiceZone;

  const fareRule: FareRule = {
    id: 'd2e188bd-681a-4f19-9d47-f4b6526ef311',
    serviceZoneId: zone.id,
    serviceZone: zone,
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
    status: FareRuleStatus.DRAFT,
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    effectiveUntil: new Date('2099-01-01T00:00:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    zoneQueryBuilder = createQueryBuilderMock<ServiceZone>();
    lockRuleQueryBuilder = createQueryBuilderMock<FareRule>();
    overlapQueryBuilder = createQueryBuilderMock<FareRule>();

    const zoneRepository = {
      createQueryBuilder: jest.fn(() => zoneQueryBuilder),
    };

    let fareRuleQueryBuilderCall = 0;

    const fareRuleRepository = {
      findOne: jest.fn(() => Promise.resolve({ ...fareRule })),
      createQueryBuilder: jest.fn(() => {
        fareRuleQueryBuilderCall += 1;

        return fareRuleQueryBuilderCall === 1
          ? lockRuleQueryBuilder
          : overlapQueryBuilder;
      }),
      create: jest.fn((input: Partial<FareRule>): FareRule => ({
        ...fareRule,
        ...input,
      })),
      save: jest.fn((entity: FareRule): Promise<FareRule> =>
        Promise.resolve(entity),
      ),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === ServiceZone) {
          return zoneRepository;
        }

        if (entity === FareRule) {
          return fareRuleRepository;
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
        FareRulesService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<FareRulesService>(FareRulesService);

    zoneQueryBuilder.getOne.mockResolvedValue({
      ...zone,
    });
    lockRuleQueryBuilder.getOne.mockResolvedValue({
      ...fareRule,
    });
    overlapQueryBuilder.getOne.mockResolvedValue(null);
  });

  it('debe activar una regla cuando no existe superposición', async () => {
    const result = await service.activate(fareRule.id);

    expect(result.status).toBe(FareRuleStatus.ACTIVE);
  });

  it('debe impedir dos reglas activas superpuestas', async () => {
    overlapQueryBuilder.getOne.mockResolvedValue({
      ...fareRule,
      id: 'be9b9f04-15f8-4fdd-aa26-c26ed2e44716',
      status: FareRuleStatus.ACTIVE,
    });

    await expect(service.activate(fareRule.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
