import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';

import { DriverDailyStatsController } from '../modules/rides/driver-daily-stats.controller';
import { DriverDailyStatsService } from '../modules/rides/driver-daily-stats.service';
import { buildSwaggerConfiguration, SWAGGER_TAGS } from './swagger.config';

describe('buildSwaggerConfiguration', () => {
  it('describes the public API server and JWT authentication', () => {
    const configuration = buildSwaggerConfiguration({
      environment: 'test',
      publicApiOrigin: 'https://api.example.com/',
    });

    expect(configuration.info).toMatchObject({
      title: 'TukiTuki API',
      version: '1.0.0',
    });
    expect(configuration.info.description).toContain('mototaxis');
    expect(configuration.servers).toEqual([
      { url: 'https://api.example.com', description: 'test API' },
    ]);
    expect(configuration.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('declares every API tag once and documents the mobile domains', () => {
    const configuration = buildSwaggerConfiguration();
    const tagNames = configuration.tags?.map((tag) => tag.name) ?? [];

    expect(new Set(tagNames).size).toBe(tagNames.length);
    expect(tagNames).toHaveLength(SWAGGER_TAGS.length);
    expect(tagNames).toEqual(
      expect.arrayContaining([
        'Auth',
        'Fares',
        'Passenger rides',
        'Driver rides',
        'Passenger digital payments',
        'Ride safety',
      ]),
    );
  });
});

/*
 * Regresión del error de CI:
 *
 *   GET /api/v1/drivers/me/stats/daily uses undeclared tag
 *   "Driver stats"
 *
 * `npm run openapi:export` necesita levantar toda la app
 * (Postgres/Redis reales), así que no puede correr en este
 * suite, y `scripts/export-openapi.ts` no es importable en
 * tests: su top-level `void exportApiContracts()` arranca
 * la app real en cuanto se importa el módulo. Por eso esta
 * prueba arma un documento OpenAPI solo con el controller
 * nuevo (sin DB/Redis) y repite, inline, la misma regla que
 * aplica `validateOpenApiDocument` en scripts/export-openapi.ts:
 * todo tag usado por una operación debe estar en
 * document.tags.
 */
describe('validateOpenApiDocument - Driver stats', () => {
  it('declara el tag "Driver stats" usado por GET /drivers/me/stats/daily', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DriverDailyStatsController],
      providers: [
        {
          provide: DriverDailyStatsService,
          useValue: {},
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();

    try {
      await app.init();

      const document = SwaggerModule.createDocument(
        app,
        buildSwaggerConfiguration(),
      );

      const operation = document.paths['/drivers/me/stats/daily']?.get;
      const declaredTags = new Set(document.tags?.map((tag) => tag.name) ?? []);

      expect(operation?.tags).toEqual(['Driver stats']);

      for (const tag of operation?.tags ?? []) {
        expect(declaredTags.has(tag)).toBe(true);
      }
    } finally {
      await app.close();
    }
  });
});
