import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { ServiceZone } from './entities/service-zone.entity';
import { ServiceZoneStatus } from './enums/service-zone-status.enum';
import { ServiceZonesService } from './service-zones.service';

type QueryBuilderMock = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  setLock: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getOne: jest.Mock<Promise<ServiceZone | null>, []>;
  getManyAndCount: jest.Mock<Promise<[ServiceZone[], number]>, []>;
};

function createQueryBuilderMock(): QueryBuilderMock {
  const queryBuilder = {} as QueryBuilderMock;

  queryBuilder.where = jest.fn(() => queryBuilder);
  queryBuilder.andWhere = jest.fn(() => queryBuilder);
  queryBuilder.orderBy = jest.fn(() => queryBuilder);
  queryBuilder.addOrderBy = jest.fn(() => queryBuilder);
  queryBuilder.setLock = jest.fn(() => queryBuilder);
  queryBuilder.skip = jest.fn(() => queryBuilder);
  queryBuilder.take = jest.fn(() => queryBuilder);
  queryBuilder.getOne = jest.fn<Promise<ServiceZone | null>, []>(() =>
    Promise.resolve(null),
  );
  queryBuilder.getManyAndCount = jest.fn<Promise<[ServiceZone[], number]>, []>(
    () => Promise.resolve([[], 0]),
  );

  return queryBuilder;
}

describe('ServiceZonesService', () => {
  let service: ServiceZonesService;
  let queryBuilder: QueryBuilderMock;

  const zone: ServiceZone = {
    id: '7d37cc0a-bbbe-4cd1-a244-b8eca8350012',
    name: 'Tarapoto Centro',
    code: 'TARAPOTO_CENTRO',
    description: null,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [-76.39, -6.53],
          [-76.32, -6.53],
          [-76.32, -6.44],
          [-76.39, -6.44],
          [-76.39, -6.53],
        ],
      ],
    },
    status: ServiceZoneStatus.INACTIVE,
    priority: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    queryBuilder = createQueryBuilderMock();

    const repository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      create: jest.fn((input: Partial<ServiceZone>): ServiceZone => ({
        ...zone,
        ...input,
      })),
      save: jest.fn((entity: ServiceZone): Promise<ServiceZone> =>
        Promise.resolve(entity),
      ),
      findOne: jest.fn(() => Promise.resolve(null)),
    };

    const managerMock = {
      getRepository: jest.fn(() => repository),
      query: jest.fn(() =>
        Promise.resolve([
          {
            isValid: true,
            reason: 'Valid Geometry',
            areaSquareMeters: '1200000',
          },
        ]),
      ),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
      getRepository: jest.fn(() => repository),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceZonesService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<ServiceZonesService>(ServiceZonesService);
  });

  it('debe crear una zona inicialmente INACTIVE', async () => {
    const result = await service.create({
      name: zone.name,
      code: zone.code,
      boundary: zone.boundary,
      priority: zone.priority,
    });

    expect(result.status).toBe(ServiceZoneStatus.INACTIVE);
    expect(result.code).toBe(zone.code);
  });

  it('debe rechazar un anillo que no está cerrado', async () => {
    await expect(
      service.create({
        name: zone.name,
        code: zone.code,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [-76.39, -6.53],
              [-76.32, -6.53],
              [-76.32, -6.44],
              [-76.39, -6.44],
            ],
          ],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe detectar un punto cubierto', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ...zone,
      status: ServiceZoneStatus.ACTIVE,
    });

    const result = await service.checkPoint({
      latitude: -6.4877,
      longitude: -76.3599,
    });

    expect(result.covered).toBe(true);
    expect(result.zone?.id).toBe(zone.id);
  });

  it('debe devolver false fuera de cobertura', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    const result = await service.checkPoint({
      latitude: -7.1,
      longitude: -77.1,
    });

    expect(result).toEqual({
      covered: false,
      zone: null,
    });
  });
});
