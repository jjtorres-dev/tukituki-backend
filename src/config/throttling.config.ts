import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

export function createThrottlerOptions(
  configService: ConfigService,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'default',
        ttl: configService.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
        limit: configService.getOrThrow<number>('RATE_LIMIT_MAX'),
        blockDuration: configService.getOrThrow<number>(
          'RATE_LIMIT_BLOCK_DURATION_MS',
        ),
      },
    ],
    skipIf: (context: ExecutionContext) => context.getType() !== 'http',
    errorMessage: 'Demasiadas solicitudes; inténtalo nuevamente más tarde',
  };
}
