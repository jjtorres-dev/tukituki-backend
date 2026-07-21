import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = configService.getOrThrow<number>('PORT');
  const apiPrefix = configService.getOrThrow<string>('API_PREFIX');
  const adminWebOrigin = configService.getOrThrow<string>('ADMIN_WEB_ORIGIN');

  app.setGlobalPrefix(apiPrefix);

  app.enableCors({
    origin: adminWebOrigin,
    credentials: true,
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

  app.enableShutdownHooks();

  const swaggerConfiguration = new DocumentBuilder()
    .setTitle('TukiTuki API')
    .setDescription(
      'API central para pasajeros, conductores y administración de TukiTuki',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfiguration,
  );

  SwaggerModule.setup('docs', app, swaggerDocument, {
    jsonDocumentUrl: 'docs-json',
  });

  await app.listen(port, '0.0.0.0');

  console.log(`TukiTuki Backend: http://localhost:${port}/${apiPrefix}`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}

void bootstrap();
