import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { DataSource } from 'typeorm';

import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { Ride } from '../entities/ride.entity';

@Injectable()
export class RideRealtimeAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async assertParticipant(
    user: AuthenticatedUser,
    rideId: string,
  ): Promise<Ride> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: { id: rideId },
    });

    if (!ride) {
      throw new WsException('El viaje no existe o no está disponible');
    }

    if (
      user.roles.includes(UserRole.ADMIN) ||
      user.roles.includes(UserRole.SUPER_ADMIN)
    ) {
      return ride;
    }

    if (
      user.roles.includes(UserRole.PASSENGER) &&
      ride.passengerUserId === user.id
    ) {
      return ride;
    }

    if (user.roles.includes(UserRole.DRIVER) && ride.driverProfileId) {
      const profile = await this.dataSource
        .getRepository(DriverProfile)
        .findOne({
          where: { userId: user.id },
        });

      if (profile?.id === ride.driverProfileId) {
        return ride;
      }
    }

    throw new WsException('No tienes permiso para acceder a este viaje');
  }
}
