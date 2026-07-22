import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminServiceZonesController } from './admin-service-zones.controller';
import { ServiceZone } from './entities/service-zone.entity';
import { ServiceZonesController } from './service-zones.controller';
import { ServiceZonesService } from './service-zones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceZone]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [AdminServiceZonesController, ServiceZonesController],
  providers: [ServiceZonesService],
  exports: [ServiceZonesService, TypeOrmModule],
})
export class ServiceZonesModule {}
