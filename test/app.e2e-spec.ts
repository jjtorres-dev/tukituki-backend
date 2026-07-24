import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';

describe('Backend readiness (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApplication(app, { exposeSwagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('expone liveness sin consultar dependencias', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('confirma readiness de PostgreSQL y Redis', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    const body = response.body as {
      status: string;
      info: { database: { status: string }; redis: { status: string } };
    };

    expect(body.status).toBe('ok');
    expect(body.info.database.status).toBe('up');
    expect(body.info.redis.status).toBe('up');
  });

  it('normaliza errores y propaga el request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/no-existe?token=no-debe-aparecer')
      .set('X-Request-Id', 'e2e-request-123')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('e2e-request-123');
    expect(response.body).toMatchObject({
      statusCode: 404,
      requestId: 'e2e-request-123',
      path: '/api/v1/no-existe',
    });
    expect(JSON.stringify(response.body)).not.toContain('no-debe-aparecer');
  });

  it('no expone Swagger cuando está deshabilitado', async () => {
    await request(app.getHttpServer()).get('/docs').expect(404);
  });
});
