import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { OutboxService } from '../outbox/outbox.service';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { RideShareLink } from './entities/ride-share-link.entity';
import { RideShareLinkStatus } from './enums/ride-share-link-status.enum';
import { RideShareLinksService } from './ride-share-links.service';
import {
  generateRideShareToken,
  hashRideShareToken,
} from './ride-share-token.util';

function buildConfigService(): ConfigService {
  const values: Record<string, unknown> = {
    PUBLIC_APP_ORIGIN: 'http://localhost:3000',
    RIDE_SHARE_DEFAULT_TTL_MINUTES: 120,
    RIDE_SHARE_MAX_TTL_MINUTES: 1440,
    RIDE_SHARE_RATE_LIMIT_MAX: 60,
    RIDE_SHARE_RATE_LIMIT_WINDOW_SECONDS: 600,
    JWT_ACCESS_SECRET:
      'a-jwt-secret-of-at-least-64-characters-000000000000000000000000',
  };

  return {
    get: <T>(key: string, defaultValue?: T): T =>
      (values[key] as T | undefined) ?? (defaultValue as T),
    getOrThrow: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
}

describe('RideShareLinksService.getPublic / resolveAndRecordAccess', () => {
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  const driverProfile = {
    id: driverProfileId,
    firstName: 'Carlos',
    photoUrl: 'https://cdn.tukituki.pe/legacy.jpg',
    photoObjectKey: 'drivers/x/profile/1.jpg',
  } as DriverProfile;

  const ride = {
    id: rideId,
    driverProfileId,
    driverProfile,
    status: RideStatus.IN_PROGRESS,
    originPosition: { type: 'Point', coordinates: [-76.3599, -6.4877] },
    destinationPosition: { type: 'Point', coordinates: [-76.3655, -6.4812] },
    originAddress: 'Jr. Lima 250, Tarapoto',
    destinationAddress: 'Plaza de Armas de Morales',
    requestedAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
  } as unknown as Ride;

  function buildService(overrides?: {
    linkOverrides?: Partial<RideShareLink>;
    resolveDriverAvatarUrl?: jest.Mock;
  }): {
    service: RideShareLinksService;
    resolveDriverAvatarUrl: jest.Mock;
    linkRepository: { findOne: jest.Mock; save: jest.Mock };
  } {
    const link = {
      id: 'link-1',
      rideId,
      ride,
      status: RideShareLinkStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      lastAccessedAt: null,
      accessCount: 0,
      ...overrides?.linkOverrides,
    } as unknown as RideShareLink;

    const linkRepository = {
      findOne: jest.fn(() => Promise.resolve(link)),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const accessRepository = {
      count: jest.fn(() => Promise.resolve(0)),
      create: jest.fn((input: unknown) => input),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RideShareLink) return linkRepository;
        return accessRepository;
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (value: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(null)),
      })),
    } as unknown as DataSource;

    const resolveDriverAvatarUrl =
      overrides?.resolveDriverAvatarUrl ??
      jest.fn(
        () => 'https://api.tukituki.pe/api/v1/storage/avatars/driver/token',
      );
    const avatarResolver = {
      resolveDriverAvatarUrl,
      resolvePassengerAvatarUrl: jest.fn(() => null),
    } as unknown as AvatarUrlResolverService;

    const outboxService = {} as OutboxService;

    const service = new RideShareLinksService(
      dataSource,
      buildConfigService(),
      outboxService,
      avatarResolver,
    );

    return { service, resolveDriverAvatarUrl, linkRepository };
  }

  it('un share token VÁLIDO muestra la foto del conductor (vía capability token del avatar, no el objectKey)', async () => {
    const { service, resolveDriverAvatarUrl } = buildService();
    const token = generateRideShareToken();

    const result = await service.getPublic(token, '203.0.113.5');

    expect(resolveDriverAvatarUrl).toHaveBeenCalledWith(driverProfile);
    expect(result.driver?.photoUrl).toBe(
      'https://api.tukituki.pe/api/v1/storage/avatars/driver/token',
    );
    expect(JSON.stringify(result)).not.toMatch(/drivers\/x\/profile/);
  });

  it('un share token INVÁLIDO (no existe) no muestra nada — NotFoundException', async () => {
    const { service, resolveDriverAvatarUrl, linkRepository } = buildService();
    linkRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getPublic(generateRideShareToken(), '203.0.113.5'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resolveDriverAvatarUrl).not.toHaveBeenCalled();
  });

  it('un share token VENCIDO no muestra nada — NotFoundException', async () => {
    const { service, resolveDriverAvatarUrl } = buildService({
      linkOverrides: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      service.getPublic(generateRideShareToken(), '203.0.113.5'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resolveDriverAvatarUrl).not.toHaveBeenCalled();
  });

  it('un share token REVOCADO no muestra nada — NotFoundException', async () => {
    const { service, resolveDriverAvatarUrl } = buildService({
      linkOverrides: { status: RideShareLinkStatus.REVOKED },
    });

    await expect(
      service.getPublic(generateRideShareToken(), '203.0.113.5'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resolveDriverAvatarUrl).not.toHaveBeenCalled();
  });

  it('el token de un share resuelve siempre al conductor de SU PROPIO ride (por construcción, vía tokenHash -> link -> ride)', async () => {
    const otherDriverProfile = {
      id: 'otro-driver-profile',
      firstName: 'Miguel',
      photoUrl: null,
      photoObjectKey: 'drivers/otro/profile/1.jpg',
    } as DriverProfile;
    const otherRide = {
      ...ride,
      driverProfileId: otherDriverProfile.id,
      driverProfile: otherDriverProfile,
    } as unknown as Ride;
    const resolveDriverAvatarUrl = jest.fn(
      () => 'https://resolved.example/other.jpg',
    );
    const { service } = buildService({
      linkOverrides: { ride: otherRide },
      resolveDriverAvatarUrl,
    });

    const result = await service.getPublic(
      generateRideShareToken(),
      '203.0.113.5',
    );

    expect(resolveDriverAvatarUrl).toHaveBeenCalledWith(otherDriverProfile);
    expect(resolveDriverAvatarUrl).not.toHaveBeenCalledWith(driverProfile);
    expect(result.driver?.photoUrl).toBe('https://resolved.example/other.jpg');
  });

  it('hashea el token recibido para buscar el link (nunca compara el token en texto plano)', async () => {
    const { service, linkRepository } = buildService();
    const token = generateRideShareToken();

    await service.getPublic(token, '203.0.113.5');

    expect(linkRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashRideShareToken(token) },
      }),
    );
  });
});
