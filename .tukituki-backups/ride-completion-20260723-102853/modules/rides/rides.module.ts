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
import { DriverRidesController } from './driver-rides.controller';
import { DriverRidesService } from './driver-rides.service';
import { RideOffer } from './entities/ride-offer.entity';
import { RideStartCode } from './entities/ride-start-code.entity';
import { RideStatusHistory } from './entities/ride-status-history.entity';
import { Ride } from './entities/ride.entity';
import { PassengerRidesController } from './passenger-rides.controller';
import { PassengerRidesService } from './passenger-rides.service';
import { RideRealtimeModule } from './realtime/ride-realtime.module';
import { RideDispatchService } from './ride-dispatch.service';
import { RideStartCodesService } from './ride-start-codes.service';
import { RideStartService } from './ride-start.service';
import { RideTransitionsService } from './ride-transitions.service';
import { RideViewService } from './ride-view.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ride,
      RideOffer,
      RideStatusHistory,
      RideStartCode,
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
    RideRealtimeModule,
    DriverOperationsModule,
  ],
  controllers: [
    PassengerRidesController,
    DriverRideOffersController,
    DriverRidesController,
  ],
  providers: [
    PassengerRidesService,
    RideDispatchService,
    DriverRideOffersService,
    DriverRidesService,
    RideTransitionsService,
    RideViewService,
    RideStartCodesService,
    RideStartService,
  ],
  exports: [
    PassengerRidesService,
    RideDispatchService,
    DriverRideOffersService,
    DriverRidesService,
    RideTransitionsService,
    RideViewService,
    RideStartCodesService,
    RideStartService,
  ],
})
export class RidesModule {}
