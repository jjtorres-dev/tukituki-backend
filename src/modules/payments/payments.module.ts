import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { Ride } from '../rides/entities/ride.entity';
import { AdminCashPaymentsController } from './admin-cash-payments.controller';
import { CashPaymentsService } from './cash-payments.service';
import { DriverCashPaymentsController } from './driver-cash-payments.controller';
import { RidePayment } from './entities/ride-payment.entity';
import { PassengerCashPaymentsController } from './passenger-cash-payments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RidePayment, Ride, DriverProfile]),
    AuthModule,
    AuthorizationModule,
    OutboxModule,
  ],
  controllers: [
    DriverCashPaymentsController,
    PassengerCashPaymentsController,
    AdminCashPaymentsController,
  ],
  providers: [CashPaymentsService],
  exports: [CashPaymentsService],
})
export class PaymentsModule {}
