import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverOperationsModule } from '../driver-operations/driver-operations.module';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareRule } from '../fares/entities/fare-rule.entity';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { User } from '../users/entities/user.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { DriverRideOffersController } from './driver-ride-offers.controller';
import { DriverRideOffersService } from './driver-ride-offers.service';
import { DriverRidesController } from './driver-rides.controller';
import { DriverRidesService } from './driver-rides.service';
import { RideFinalFare } from './entities/ride-final-fare.entity';
import { RideLocationSample } from './entities/ride-location-sample.entity';
import { RideOffer } from './entities/ride-offer.entity';
import { RideProgressMetrics } from './entities/ride-progress-metrics.entity';
import { RideRating } from './entities/ride-rating.entity';
import { RideStartCode } from './entities/ride-start-code.entity';
import { RideStatusHistory } from './entities/ride-status-history.entity';
import { Ride } from './entities/ride.entity';
import { PassengerRidesController } from './passenger-rides.controller';
import { PassengerRidesService } from './passenger-rides.service';
import { RideRealtimeModule } from './realtime/ride-realtime.module';
import { RideCompletionService } from './ride-completion.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideDispatchWorker } from './ride-dispatch.worker';
import { RideReceiptsService } from './ride-receipts.service';
import { RideHistoryService } from './ride-history.service';
import { RideRatingsService } from './ride-ratings.service';
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
      RideLocationSample,
      RideProgressMetrics,
      RideFinalFare,
      RideRating,
      FareQuote,
      FareRule,
      ServiceZone,
      User,
      PassengerProfile,
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
    OutboxModule,
  ],
  controllers: [
    PassengerRidesController,
    DriverRideOffersController,
    DriverRidesController,
  ],
  providers: [
    PassengerRidesService,
    RideDispatchService,
    RideDispatchWorker,
    DriverRideOffersService,
    DriverRidesService,
    RideTransitionsService,
    RideViewService,
    RideStartCodesService,
    RideStartService,
    RideCompletionService,
    RideReceiptsService,
    RideHistoryService,
    RideRatingsService,
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
    RideCompletionService,
    RideReceiptsService,
    RideHistoryService,
    RideRatingsService,
  ],
})
export class RidesModule {}
