import { Global, Module } from '@nestjs/common';

import { DriverAvailabilityRedisService } from './driver-availability-redis.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, DriverAvailabilityRedisService],
  exports: [RedisService, DriverAvailabilityRedisService],
})
export class RedisModule {}
