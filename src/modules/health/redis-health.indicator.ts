import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';

import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly indicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult<'redis'>> {
    const indicator = this.indicatorService.check('redis');

    try {
      const response = await this.redis.ping();
      return response === 'PONG'
        ? indicator.up()
        : indicator.down('Redis no respondió correctamente');
    } catch {
      return indicator.down('Redis no está disponible');
    }
  }
}
