import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FareQuote } from '../fares/entities/fare-quote.entity';
import { Ride } from '../rides/entities/ride.entity';
import { AdminPromotionsController } from './admin-promotions.controller';
import { PromotionRedemption } from './entities/promotion-redemption.entity';
import { Promotion } from './entities/promotion.entity';
import { PassengerPromotionsController } from './passenger-promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Promotion, PromotionRedemption, FareQuote, Ride]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [AdminPromotionsController, PassengerPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
