import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
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
import { PromotionsModule } from '../promotions/promotions.module';
import { DriverRideOffersController } from './driver-ride-offers.controller';
import { AdminRideCancellationsController } from './admin-ride-cancellations.controller';
import { RidePayment } from '../payments/entities/ride-payment.entity';
import { FinancialObligationsController } from './financial-obligations.controller';
import { DriverRideOffersService } from './driver-ride-offers.service';
import { DriverRidesController } from './driver-rides.controller';
import { DriverRidesService } from './driver-rides.service';
import { RideFinalFare } from './entities/ride-final-fare.entity';
import { CancellationPolicy } from './entities/cancellation-policy.entity';
import { RideCancellation } from './entities/ride-cancellation.entity';
import { RideWaiting } from './entities/ride-waiting.entity';
import { UserFinancialObligation } from './entities/user-financial-obligation.entity';
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
import { CancellationPolicyService } from './cancellation-policy.service';
import { CancellationFeeCalculatorService } from './cancellation-fee-calculator.service';
import { RideCancellationsService } from './ride-cancellations.service';
import { FinancialObligationsService } from './financial-obligations.service';
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
      CancellationPolicy,
      RideCancellation,
      RideWaiting,
      UserFinancialObligation,
      RideOffer,
      RideStatusHistory,
      RideStartCode,
      RideLocationSample,
      RideProgressMetrics,
      RideFinalFare,
      RideRating,
      RidePayment,
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
    CommissionsModule,
    PromotionsModule,
  ],
  controllers: [
    PassengerRidesController,
    DriverRideOffersController,
    DriverRidesController,
    FinancialObligationsController,
    AdminRideCancellationsController,
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
    CancellationPolicyService,
    CancellationFeeCalculatorService,
    RideCancellationsService,
    FinancialObligationsService,
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
    CancellationPolicyService,
    CancellationFeeCalculatorService,
    RideCancellationsService,
    FinancialObligationsService,
  ],
})
export class RidesModule {}
