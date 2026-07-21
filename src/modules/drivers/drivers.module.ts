import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverDocumentsController } from './driver-documents.controller';
import { DriverDocumentsService } from './driver-documents.service';
import { DriverVehiclesController } from './driver-vehicles.controller';
import { DriverVehiclesService } from './driver-vehicles.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverApplicationSubmissionService } from './driver-application-submission.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverProfile, DriverVehicle, DriverDocument]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    DriversController,
    DriverVehiclesController,
    DriverDocumentsController,
  ],
  providers: [
    DriversService,
    DriverVehiclesService,
    DriverDocumentsService,
    DriverApplicationSubmissionService,
  ],
  exports: [
    DriversService,
    DriverVehiclesService,
    DriverDocumentsService,
    DriverApplicationSubmissionService,
  ],
})
export class DriversModule {}
