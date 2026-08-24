import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveAvatarUrl } from './avatar-url.util';
import type { AvatarUrlContext } from './avatar-url.util';

export interface AvatarOwnerProfile {
  id: string;
  photoObjectKey: string | null;
  photoUrl: string | null;
}

/*
 * Único punto donde se resuelve "photoUrl" para una respuesta ya
 * autorizada (self-view, ride propio, historial propio, share-link
 * válido, admin). Sin dependencias de Drivers/Passengers/Storage para
 * poder importarse desde cualquier módulo sin ciclos (ver AvatarModule).
 */
@Injectable()
export class AvatarUrlResolverService {
  private readonly context: AvatarUrlContext;

  constructor(configService: ConfigService) {
    this.context = {
      publicApiOrigin: configService.getOrThrow<string>('PUBLIC_API_ORIGIN'),
      apiPrefix: configService.getOrThrow<string>('API_PREFIX'),
      tokenSecret: configService.get<string>('STORAGE_AVATAR_TOKEN_SECRET', ''),
      tokenTtlSeconds: configService.getOrThrow<number>(
        'STORAGE_AVATAR_TOKEN_TTL_SECONDS',
      ),
    };
  }

  resolveDriverAvatarUrl(profile: AvatarOwnerProfile | null): string | null {
    if (!profile) {
      return null;
    }

    return resolveAvatarUrl(
      this.context,
      'driver',
      profile.id,
      profile.photoObjectKey,
      profile.photoUrl,
    );
  }

  resolvePassengerAvatarUrl(profile: AvatarOwnerProfile | null): string | null {
    if (!profile) {
      return null;
    }

    return resolveAvatarUrl(
      this.context,
      'passenger',
      profile.id,
      profile.photoObjectKey,
      profile.photoUrl,
    );
  }
}
