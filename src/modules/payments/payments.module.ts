import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { Ride } from '../rides/entities/ride.entity';
import { AdminCashPaymentsController } from './admin-cash-payments.controller';
import { CashPaymentsService } from './cash-payments.service';
import { DigitalPaymentsService } from './digital-payments.service';
import { DriverCashPaymentsController } from './driver-cash-payments.controller';
import { DigitalPaymentAttempt } from './entities/digital-payment-attempt.entity';
import { RidePayment } from './entities/ride-payment.entity';
import { IzipayPaymentGateway } from './gateways/izipay-payment.gateway';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { IzipayWebhookController } from './izipay-webhook.controller';
import { PassengerCashPaymentsController } from './passenger-cash-payments.controller';
import { PassengerDigitalPaymentsController } from './passenger-digital-payments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RidePayment,
      DigitalPaymentAttempt,
      Ride,
      DriverProfile,
      PassengerProfile,
    ]),
    AuthModule,
    AuthorizationModule,
    OutboxModule,
    CommissionsModule,
  ],
  controllers: [
    DriverCashPaymentsController,
    PassengerCashPaymentsController,
    PassengerDigitalPaymentsController,
    AdminCashPaymentsController,
    IzipayWebhookController,
  ],
  providers: [
    CashPaymentsService,
    DigitalPaymentsService,
    IzipayPaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: IzipayPaymentGateway,
    },
  ],
  exports: [CashPaymentsService, DigitalPaymentsService],
})
export class PaymentsModule {}
