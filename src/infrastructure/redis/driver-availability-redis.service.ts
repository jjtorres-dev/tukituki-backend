import { Injectable } from '@nestjs/common';

import { RedisService } from './redis.service';
import type { RedisGeoSearchResult } from './redis.service';

const AVAILABLE_DRIVERS_GEO_KEY = 'drivers:available';

export const DRIVER_PRESENCE_TTL_SECONDS = 90;

const DRIVER_LOCATION_TTL_SECONDS = 45;

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
      ),
    ]);
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
}
