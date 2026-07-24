import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RedisHealthIndicator } from './redis-health.indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Comprobar que el proceso del backend está activo' })
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Comprobar el estado del backend y sus dependencias',
  })
  check() {
    return this.runReadinessChecks();
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Comprobar que PostgreSQL y Redis aceptan tráfico',
  })
  readiness() {
    return this.runReadinessChecks();
  }

  private runReadinessChecks() {
    return this.healthCheckService.check([
      () => this.database.pingCheck('database'),
      () => this.redis.isHealthy(),
    ]);
  }
}
