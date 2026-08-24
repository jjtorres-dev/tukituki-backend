import { Module } from '@nestjs/common';

import { AvatarUrlResolverService } from './avatar-url-resolver.service';

/*
 * Sin dependencias de otros módulos de negocio a propósito: cualquier
 * módulo (Drivers, Passengers, Rides, Safety, AdminRides, AdminDrivers,
 * Storage) puede importarlo sin riesgo de ciclos.
 */
@Module({
  providers: [AvatarUrlResolverService],
  exports: [AvatarUrlResolverService],
})
export class AvatarModule {}
