import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;

  const healthCheckServiceMock = {
    check: jest.fn(),
  };

  const databaseMock = {
    pingCheck: jest.fn(),
  };

  const redisMock = {
    isHealthy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: healthCheckServiceMock,
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: databaseMock,
        },
        {
          provide: RedisHealthIndicator,
          useValue: redisMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe ejecutar la comprobación de salud', async () => {
    const expectedResult = {
      status: 'ok',
      info: {
        database: {
          status: 'up',
        },
      },
      error: {},
      details: {
        database: {
          status: 'up',
        },
      },
    };

    healthCheckServiceMock.check.mockResolvedValue(expectedResult);

    const result = await controller.check();

    expect(healthCheckServiceMock.check).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expectedResult);
  });
});
