import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverOperationsController } from './driver-operations.controller';
import { DriverOperationsService } from './driver-operations.service';
import { DriverOperationalState } from './entities/driver-operational-state.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverProfile,
      DriverVehicle,
      DriverDocument,
      DriverOperationalState,
    ]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [DriverOperationsController],
  providers: [DriverOperationsService],
  exports: [DriverOperationsService],
})
export class DriverOperationsModule {}
