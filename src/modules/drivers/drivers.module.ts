import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DriverVehiclesController } from './driver-vehicles.controller';
import { DriverVehiclesService } from './driver-vehicles.service';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverProfile, DriverVehicle]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [DriversController, DriverVehiclesController],
  providers: [DriversService, DriverVehiclesService],
  exports: [DriversService, DriverVehiclesService],
})
export class DriversModule {}
