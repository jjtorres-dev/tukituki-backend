import {
  ConsoleLogger,
  type INestApplication,
  type LogLevel,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import type { Express } from 'express';
import helmet from 'helmet';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';
import { parseCorsOrigins } from './config/cors.config';
import { createSwaggerDocument } from './config/swagger.config';

export interface ApplicationSetupOptions {
  exposeSwagger?: boolean;
}

export function createApplicationLogger(): ConsoleLogger {
  const jsonOutput = process.env.LOG_FORMAT === 'json';

  return new ConsoleLogger({
    json: jsonOutput,
    colors: !jsonOutput,
    timestamp: true,
    logLevels: parseLogLevels(process.env.LOG_LEVEL),
  });
}

export function configureApplication(
  app: INestApplication,
  options: ApplicationSetupOptions = {},
): void {
  const configService = app.get(ConfigService);
  const apiPrefix = configService.getOrThrow<string>('API_PREFIX');
  const bodyLimit = configService.get<string>('REQUEST_BODY_LIMIT', '1mb');
  const exposeSwagger =
    options.exposeSwagger ??
    configService.get<boolean>('SWAGGER_ENABLED', true);

  app.setGlobalPrefix(apiPrefix);
  // Nest se inicia con platform-express; la interfaz común expone la instancia como any.
  const expressApplication = app.getHttpAdapter().getInstance() as Express;
  expressApplication.set(
    'trust proxy',
    configService.get<number>('TRUST_PROXY_HOPS', 1),
  );
  app.use(helmet({ contentSecurityPolicy: exposeSwagger ? false : undefined }));
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.use(requestContextMiddleware);
  app.enableCors({
    origin: parseCorsOrigins(
      configService.get<string>('CORS_ALLOWED_ORIGINS'),
      configService.getOrThrow<string>('ADMIN_WEB_ORIGIN'),
    ),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  if (exposeSwagger) {
    SwaggerModule.setup('docs', app, createSwaggerDocument(app), {
      jsonDocumentUrl: 'docs-json',
    });
  }
}

function parseLogLevels(configured: string | undefined): LogLevel[] {
  const supportedLevels = new Set<LogLevel>([
    'fatal',
    'error',
    'warn',
    'log',
    'debug',
    'verbose',
  ]);
  const levels = configured
    ?.split(',')
    .map((level) => level.trim() as LogLevel)
    .filter((level) => supportedLevels.has(level));

  return levels && levels.length > 0
    ? levels
    : ['fatal', 'error', 'warn', 'log'];
}
