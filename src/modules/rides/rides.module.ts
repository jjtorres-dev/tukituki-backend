import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverOperationsModule } from '../driver-operations/driver-operations.module';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareRule } from '../fares/entities/fare-rule.entity';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { User } from '../users/entities/user.entity';
import { DriverRideOffersController } from './driver-ride-offers.controller';
import { DriverRideOffersService } from './driver-ride-offers.service';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { PassengerRidesController } from './passenger-rides.controller';
import { PassengerRidesService } from './passenger-rides.service';
import { RideDispatchService } from './ride-dispatch.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ride,
      RideOffer,
      FareQuote,
      FareRule,
      ServiceZone,
      User,
      DriverProfile,
      DriverVehicle,
      DriverDocument,
      DriverOperationalState,
      DriverLocation,
    ]),
    AuthModule,
    AuthorizationModule,
    DriverOperationsModule,
  ],
  controllers: [PassengerRidesController, DriverRideOffersController],
  providers: [
    PassengerRidesService,
    RideDispatchService,
    DriverRideOffersService,
  ],
  exports: [
    PassengerRidesService,
    RideDispatchService,
    DriverRideOffersService,
  ],
})
export class RidesModule {}
