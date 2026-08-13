import { Injectable } from '@nestjs/common';

import { RedisService } from './redis.service';
import type { RedisGeoSearchResult } from './redis.service';

const AVAILABLE_DRIVERS_GEO_KEY = 'drivers:available';

export const DRIVER_PRESENCE_TTL_SECONDS = 90;

const DRIVER_LOCATION_TTL_SECONDS = 45;

/*
 * G3A - late-join matching.
 *
 * "discoverable-armed" es una lease continua y compartida entre
 * instancias (Redis, no memoria de proceso): cada publicación de
 * ubicación AVAILABLE renueva su TTL a DISCOVERABLE_ARM_TTL_SECONDS
 * mediante una única instrucción atómica (SET ... EX ... GET), así
 * que mientras el conductor siga publicando ubicación fresca la
 * lease nunca expira y las publicaciones periódicas NO disparan una
 * nueva búsqueda de late-join.
 *
 * Solo cuando la lease no existía (primera publicación tras
 * goOnline/reconexión, o el conductor dejó de publicar por >=
 * DISCOVERABLE_ARM_TTL_SECONDS y por tanto dejó de ser realmente
 * descubrible) la operación reporta la transición
 * no-discoverable -> discoverable, y eso dispara late-join UNA VEZ.
 */
const DISCOVERABLE_ARM_TTL_SECONDS = DRIVER_LOCATION_TTL_SECONDS;

export const LATE_JOIN_PENDING_DRIVERS_KEY = 'drivers:late-join-pending';

@Injectable()
export class DriverAvailabilityRedisService {
  constructor(private readonly redisService: RedisService) {}

  async publishAvailableDriver(
    driverProfileId: string,
    longitude: number,
    latitude: number,
  ): Promise<void> {
    await this.redisService.geoAdd(
      AVAILABLE_DRIVERS_GEO_KEY,
      longitude,
      latitude,
      driverProfileId,
    );

    try {
      const now = new Date().toISOString();

      await Promise.all([
        this.redisService.setWithTtl(
          this.getPresenceKey(driverProfileId),
          now,
          DRIVER_PRESENCE_TTL_SECONDS,
        ),
        this.redisService.setWithTtl(
          this.getLocationFreshnessKey(driverProfileId),
          now,
          DRIVER_LOCATION_TTL_SECONDS,
        ),
      ]);
    } catch (error: unknown) {
      await this.redisService
        .geoRemove(AVAILABLE_DRIVERS_GEO_KEY, driverProfileId)
        .catch(() => undefined);

      throw error;
    }
  }

  async registerBusyPresence(driverProfileId: string): Promise<void> {
    await this.redisService.geoRemove(
      AVAILABLE_DRIVERS_GEO_KEY,
      driverProfileId,
    );

    const now = new Date().toISOString();

    await Promise.all([
      this.redisService.setWithTtl(
        this.getPresenceKey(driverProfileId),
        now,
        DRIVER_PRESENCE_TTL_SECONDS,
      ),
      this.redisService.setWithTtl(
        this.getLocationFreshnessKey(driverProfileId),
        now,
        DRIVER_LOCATION_TTL_SECONDS,
      ),
      /*
       * Un conductor BUSY no es discoverable: la lease AVAILABLE
       * previa (si la había) deja de ser válida de inmediato en
       * vez de esperar a que expire sola. Así, si vuelve a estar
       * AVAILABLE poco después (ciclo de ride corto), la siguiente
       * publicación se reconoce correctamente como una transición
       * nueva en vez de heredar una lease obsoleta.
       */
      this.redisService.delete(this.getDiscoverableArmedKey(driverProfileId)),
    ]);
  }

  async registerAvailablePresence(driverProfileId: string): Promise<void> {
    await this.redisService.setWithTtl(
      this.getPresenceKey(driverProfileId),
      new Date().toISOString(),
      DRIVER_PRESENCE_TTL_SECONDS,
    );
  }

  async removeDriverAvailability(driverProfileId: string): Promise<void> {
    await Promise.all([
      this.redisService.geoRemove(AVAILABLE_DRIVERS_GEO_KEY, driverProfileId),
      this.redisService.delete(
        this.getPresenceKey(driverProfileId),
        this.getLocationFreshnessKey(driverProfileId),
        this.getDiscoverableArmedKey(driverProfileId),
      ),
    ]);
  }

  /*
   * Lease continua: CADA llamada renueva el TTL de
   * discoverable-armed a DISCOVERABLE_ARM_TTL_SECONDS (vía
   * SET ... EX ... GET, atómico), así que mientras el conductor
   * siga publicando ubicación dentro de esa ventana la marca nunca
   * expira. Solo devuelve true (y encola para late-join) la
   * primera vez, cuando la key todavía no existía: eso es la
   * transición real no-discoverable -> discoverable. Si dejó de
   * publicar por más de DISCOVERABLE_ARM_TTL_SECONDS, la key
   * expira sola y la siguiente publicación vuelve a ser "primera
   * vez".
   */
  async registerDiscoverableTransition(
    driverProfileId: string,
  ): Promise<boolean> {
    const previousValue = await this.redisService.setWithTtlReturningPrevious(
      this.getDiscoverableArmedKey(driverProfileId),
      '1',
      DISCOVERABLE_ARM_TTL_SECONDS,
    );

    const newlyDiscoverable = previousValue === null;

    if (newlyDiscoverable) {
      await this.redisService.addToSet(
        LATE_JOIN_PENDING_DRIVERS_KEY,
        driverProfileId,
      );
    }

    return newlyDiscoverable;
  }

  /*
   * Consumida por RideDispatchWorker: extrae (SPOP, atómico) hasta
   * `maxCount` conductores en espera de late-join matching. Un
   * mismo driverProfileId solo puede ser extraído por una
   * instancia, aunque haya varios workers corriendo en paralelo.
   */
  drainLateJoinPendingDrivers(maxCount: number): Promise<string[]> {
    return this.redisService.popFromSet(
      LATE_JOIN_PENDING_DRIVERS_KEY,
      maxCount,
    );
  }

  async renewPresenceIfExists(driverProfileId: string): Promise<boolean> {
    const presenceKey = this.getPresenceKey(driverProfileId);

    if (!(await this.redisService.exists(presenceKey))) {
      return false;
    }

    await this.redisService.expire(presenceKey, DRIVER_PRESENCE_TTL_SECONDS);

    return true;
  }

  async findNearbyAvailableDrivers(
    longitude: number,
    latitude: number,
    radiusMeters: number,
    limit: number,
  ): Promise<RedisGeoSearchResult[]> {
    const candidates = await this.redisService.geoSearchByRadius(
      AVAILABLE_DRIVERS_GEO_KEY,
      longitude,
      latitude,
      radiusMeters,
      limit,
    );

    if (candidates.length === 0) {
      return [];
    }

    const presenceResults = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        active: (
          await Promise.all([
            this.redisService.exists(this.getPresenceKey(candidate.member)),
            this.redisService.exists(
              this.getLocationFreshnessKey(candidate.member),
            ),
          ])
        ).every(Boolean),
      })),
    );

    const staleDriverIds = presenceResults
      .filter((result) => !result.active)
      .map((result) => result.candidate.member);

    if (staleDriverIds.length > 0) {
      await this.redisService.geoRemove(
        AVAILABLE_DRIVERS_GEO_KEY,
        ...staleDriverIds,
      );
    }

    return presenceResults
      .filter((result) => result.active)
      .map((result) => result.candidate);
  }

  private getPresenceKey(driverProfileId: string): string {
    return `drivers:presence:${driverProfileId}`;
  }

  private getLocationFreshnessKey(driverProfileId: string): string {
    return `drivers:location-fresh:${driverProfileId}`;
  }

  private getDiscoverableArmedKey(driverProfileId: string): string {
    return `drivers:discoverable-armed:${driverProfileId}`;
  }
}
