import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AvatarModule } from '../storage/avatar.module';
import { PassengerProfile } from './entities/passenger-profile.entity';
import { PassengersController } from './passengers.controller';
import { PassengersService } from './passengers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PassengerProfile]),
    AuthModule,
    AuthorizationModule,
    AvatarModule,
  ],
  controllers: [PassengersController],
  providers: [PassengersService],
  exports: [PassengersService],
})
export class PassengersModule {}
