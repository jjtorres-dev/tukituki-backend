import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication, createApplicationLogger } from './bootstrap';

async function bootstrap(): Promise<void> {
  const logger = createApplicationLogger();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger,
  });
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('PORT');
  const apiPrefix = configService.getOrThrow<string>('API_PREFIX');

  configureApplication(app);
  await app.listen(port, '0.0.0.0');

  logger.log(
    `TukiTuki Backend iniciado en el puerto ${port} con prefijo /${apiPrefix}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  const logger = createApplicationLogger();

  logger.fatal(
    error instanceof Error ? error.stack : String(error),
    'Bootstrap',
  );
  process.exitCode = 1;
});
