import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  FALLBACK_ORIGIN_ADDRESS,
  GoogleGeocodingService,
} from './google-geocoding.service';

/*
 * ORIGIN-ADDRESS-R1: protección de costo dedicada, independiente del
 * throttle global (RATE_LIMIT_*) — mismo patrón atómico
 * (RedisService.incrementWithTtl) que ya usa OTP_REQUEST_IP_LIMIT/
 * OTP_REQUEST_PHONE_LIMIT (ver auth/otp.service.ts). A diferencia de
 * OTP, la key se identifica directamente por `userId` sin fingerprint
 * HMAC: userId ya es un UUID interno opaco emitido por este mismo
 * Backend, no un dato de contacto real como el teléfono/IP que sí
 * amerita esconderse de los logs/keys de Redis.
 *
 * places/autocomplete es el otro endpoint que paga a Google por
 * llamada y hoy NO tiene límite dedicado (solo el throttle global) —
 * ver Backend/errores-conocidos.md. No es el mismo caso: autocomplete
 * se autolimita por la velocidad de tecleo humano, esto no (se
 * dispara automáticamente en cuanto el cliente obtiene un GPS).
 */
@Injectable()
export class OriginAddressService {
  constructor(
    private readonly redisService: RedisService,

    private readonly googleGeocodingService: GoogleGeocodingService,

    private readonly configService: ConfigService,
  ) {}

  async resolve(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<string> {
    await this.enforceUserRequestLimit(userId);

    /*
     * Mismo fallback honesto que `FaresService` ya usa para `origin`
     * en cada cotización — nunca lanza, nunca afirma una dirección
     * falsa.
     */
    return this.googleGeocodingService.reverseGeocode(
      latitude,
      longitude,
      FALLBACK_ORIGIN_ADDRESS,
    );
  }

  private async enforceUserRequestLimit(userId: string): Promise<void> {
    const limit = this.configService.getOrThrow<number>(
      'ORIGIN_ADDRESS_RATE_LIMIT_MAX',
    );

    const windowSeconds = this.configService.getOrThrow<number>(
      'ORIGIN_ADDRESS_RATE_LIMIT_WINDOW_SECONDS',
    );

    const count = await this.redisService.incrementWithTtl(
      `fares:origin-address:user:${userId}`,
      windowSeconds,
    );

    if (count > limit) {
      throw new HttpException(
        'Demasiadas solicitudes de dirección de origen; inténtalo nuevamente más tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
