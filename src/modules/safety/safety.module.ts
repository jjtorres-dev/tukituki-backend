import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideRealtimeModule } from '../rides/realtime/ride-realtime.module';
import { User } from '../users/entities/user.entity';
import { AdminSafetyIncidentsController } from './admin-safety-incidents.controller';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';
import { EmergencyContactAlert } from './entities/emergency-contact-alert.entity';
import { EmergencyContact } from './entities/emergency-contact.entity';
import { RideSafetyIncident } from './entities/ride-safety-incident.entity';
import { RideShareAccessLog } from './entities/ride-share-access-log.entity';
import { RideShareLink } from './entities/ride-share-link.entity';
import { PublicRideShareController } from './public-ride-share.controller';
import { SafetyRealtimeModule } from './realtime/safety-realtime.module';
import { RideSafetyController } from './ride-safety.controller';
import { RideSafetyService } from './ride-safety.service';
import { RideShareLinksController } from './ride-share-links.controller';
import { RideShareLinksService } from './ride-share-links.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmergencyContact,
      RideSafetyIncident,
      RideShareLink,
      RideShareAccessLog,
      EmergencyContactAlert,
      Ride,
      User,
      PassengerProfile,
      DriverProfile,
      DriverVehicle,
      DriverLocation,
    ]),
    AuthModule,
    AuthorizationModule,
    OutboxModule,
    RideRealtimeModule,
    SafetyRealtimeModule,
  ],
  controllers: [
    EmergencyContactsController,
    RideSafetyController,
    RideShareLinksController,
    PublicRideShareController,
    AdminSafetyIncidentsController,
  ],
  providers: [
    EmergencyContactsService,
    RideSafetyService,
    RideShareLinksService,
  ],
  exports: [EmergencyContactsService, RideSafetyService, RideShareLinksService],
})
export class SafetyModule {}
