import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Ride } from '../../rides/entities/ride.entity';
import { RideShareAccessLog } from '../entities/ride-share-access-log.entity';
import { RideShareLink } from '../entities/ride-share-link.entity';
import { SharedRideAccessService } from './shared-ride-access.service';
import { SharedRideRealtimeService } from './shared-ride-realtime.service';
import { SharedRidesGateway } from './shared-rides.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, RideShareLink, RideShareAccessLog]),
  ],
  providers: [
    SharedRideAccessService,
    SharedRidesGateway,
    SharedRideRealtimeService,
  ],
  exports: [SharedRideRealtimeService],
})
export class SafetyRealtimeModule {}
