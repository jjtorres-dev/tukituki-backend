import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { RideRealtimeModule } from '../rides/realtime/ride-realtime.module';
import { DriverLocationsController } from './driver-locations.controller';
import { DriverLocationsService } from './driver-locations.service';
import { DriverOperationsController } from './driver-operations.controller';
import { DriverOperationsService } from './driver-operations.service';
import { DriverLocation } from './entities/driver-location.entity';
import { DriverOperationalState } from './entities/driver-operational-state.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverProfile,
      DriverVehicle,
      DriverDocument,
      DriverOperationalState,
      DriverLocation,
    ]),
    AuthModule,
    AuthorizationModule,
    RideRealtimeModule,
  ],
  controllers: [DriverOperationsController, DriverLocationsController],
  providers: [DriverOperationsService, DriverLocationsService],
  exports: [DriverOperationsService, DriverLocationsService],
})
export class DriverOperationsModule {}
