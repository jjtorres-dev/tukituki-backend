import { DataSource } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideViewService } from './ride-view.service';

interface AvatarProfileLike {
  photoObjectKey?: string | null;
  photoUrl: string | null;
}

const avatarResolverMock = {
  resolveDriverAvatarUrl: jest.fn(
    (profile: AvatarProfileLike | null) =>
      (profile?.photoObjectKey
        ? 'https://resolved.example/avatar.jpg'
        : profile?.photoUrl) ?? null,
  ),
  resolvePassengerAvatarUrl: jest.fn(
    (profile: AvatarProfileLike | null) =>
      (profile?.photoObjectKey
        ? 'https://resolved.example/avatar.jpg'
        : profile?.photoUrl) ?? null,
  ),
} as unknown as AvatarUrlResolverService;

describe('RideViewService', () => {
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const passengerUserId = 'a1c2e3f4-1111-4de2-bd9f-11f33d64da64';
  const passengerProfileId = 'b2d3e4f5-2222-4de2-bd9f-11f33d64da64';

  const ride = {
    id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
    fareQuoteId: '1f66359e-d183-494d-a921-a19edbfbe2b9',
    driverProfileId,
    passengerUserId,
    status: RideStatus.DRIVER_ASSIGNED,
    stateVersion: 1,
    originPosition: {
      type: 'Point',
      coordinates: [-76.3599, -6.4877],
    },
    destinationPosition: {
      type: 'Point',
      coordinates: [-76.3655, -6.4812],
    },
    originAddress: 'Jr. Lima 250, Tarapoto',
    destinationAddress: 'Plaza de Armas de Morales',
    distanceMeters: 3200,
    estimatedDurationSeconds: 720,
    estimatedFare: '7.40',
    finalFare: null,
    currency: 'PEN',
    passengerNotes: null,
    requestedAt: new Date(),
    searchExpiresAt: new Date(),
    driverAssignedAt: new Date(),
    driverArrivingAt: null,
    driverArrivedAt: null,
    arrivalDistanceMeters: null,
    cancelledAt: null,
    cancellationReason: null,
    cancelledBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Ride;

  it('debe incluir conductor, vehículo y última ubicación después de asignar', async () => {
    const profile = {
      id: driverProfileId,
      firstName: 'Carlos',
      photoUrl: 'https://cdn.tukituki.pe/carlos.jpg',
      ratingAverage: '4.92',
      ratingCount: 128,
    } as DriverProfile;
    const vehicle = {
      driverProfileId,
      plate: '1234-AB',
      brand: 'Bajaj',
      model: 'RE 4S',
      color: 'Rojo',
      vehicleType: VehicleType.MOTOTAXI,
    } as DriverVehicle;
    const location = {
      driverProfileId,
      latitude: -6.4879,
      longitude: -76.3601,
      heading: 90,
      speed: 7.5,
      accuracy: 8,
      recordedAt: new Date(),
    } as DriverLocation;

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() => {
          if (entity === DriverProfile) return Promise.resolve(profile);
          if (entity === DriverVehicle) return Promise.resolve(vehicle);
          if (entity === DriverLocation) return Promise.resolve(location);
          return Promise.resolve(null);
        }),
      })),
    };
    const service = new RideViewService(
      dataSourceMock as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.toPassengerResponse(ride);

    expect(result.driver?.profileId).toBe(driverProfileId);
    expect(result.driver?.firstName).toBe('Carlos');
    expect(result.driver?.photoUrl).toBe('https://cdn.tukituki.pe/carlos.jpg');
    expect(result.driver?.ratingAverage).toBe('4.92');
    expect(result.driver?.ratingCount).toBe(128);
    expect(result.driver?.vehicle.plate).toBe('1234-AB');
    expect(result.driver?.vehicle.brand).toBe('Bajaj');
    expect(result.driver?.vehicle.model).toBe('RE 4S');
    expect(result.driver?.vehicle.color).toBe('Rojo');
    expect(result.driver?.vehicle.vehicleType).toBe(VehicleType.MOTOTAXI);
    expect(result.driverLocation?.latitude).toBe(-6.4879);
  });

  it('debe respetar el rating real del conductor sin historial', async () => {
    const profile = {
      id: driverProfileId,
      firstName: 'Carlos',
      photoUrl: null,
      ratingAverage: '0.00',
      ratingCount: 0,
    } as DriverProfile;
    const vehicle = {
      driverProfileId,
      plate: '1234-AB',
      brand: 'Bajaj',
      model: 'RE 4S',
      color: 'Rojo',
      vehicleType: VehicleType.MOTOTAXI,
    } as DriverVehicle;

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() => {
          if (entity === DriverProfile) return Promise.resolve(profile);
          if (entity === DriverVehicle) return Promise.resolve(vehicle);
          if (entity === DriverLocation) return Promise.resolve(null);
          return Promise.resolve(null);
        }),
      })),
    };
    const service = new RideViewService(
      dataSourceMock as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.toPassengerResponse(ride);

    expect(result.driver?.ratingAverage).toBe('0.00');
    expect(result.driver?.ratingCount).toBe(0);
  });

  it('no debe exponer conductor antes de la asignación', async () => {
    const dataSourceMock = {
      getRepository: jest.fn(),
    };
    const service = new RideViewService(
      dataSourceMock as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.toPassengerResponse({
      ...ride,
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
    });

    expect(result.driver).toBeNull();
    expect(result.driverLocation).toBeNull();
    expect(dataSourceMock.getRepository).not.toHaveBeenCalled();
  });

  it('debe incluir un resumen mínimo real del pasajero para el Driver', async () => {
    const passengerProfile = {
      id: passengerProfileId,
      userId: passengerUserId,
      firstName: 'María',
      lastName: 'Fernández',
      photoUrl: 'https://cdn.tukituki.pe/maria.jpg',
      ratingAverage: '4.85',
      ratingCount: 32,
    } as PassengerProfile;

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() => {
          if (entity === PassengerProfile) {
            return Promise.resolve(passengerProfile);
          }
          return Promise.resolve(null);
        }),
      })),
    };
    const service = new RideViewService(
      dataSourceMock as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.toDriverResponse(ride, 650);

    expect(result.passenger).not.toBeNull();
    expect(result.passenger?.profileId).toBe(passengerProfileId);
    expect(result.passenger?.firstName).toBe('María');
    expect(result.passenger?.photoUrl).toBe(
      'https://cdn.tukituki.pe/maria.jpg',
    );
    expect(result.passenger?.ratingAverage).toBe('4.85');
    expect(result.passenger?.ratingCount).toBe(32);
    expect(result.distanceToOriginMeters).toBe(650);

    // Campos sensibles explícitamente excluidos del contrato.
    expect(result.passenger).not.toHaveProperty('lastName');
    expect(result.passenger).not.toHaveProperty('phone');
    expect(result.passenger).not.toHaveProperty('email');
    expect(result.passenger).not.toHaveProperty('document');
    expect(result.passenger).not.toHaveProperty('address');
  });

  it('debe degradar a photoUrl null sin romper el resumen del pasajero', async () => {
    const passengerProfile = {
      id: passengerProfileId,
      userId: passengerUserId,
      firstName: 'María',
      lastName: 'Fernández',
      photoUrl: null,
      ratingAverage: '0.00',
      ratingCount: 0,
    } as PassengerProfile;

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() => {
          if (entity === PassengerProfile) {
            return Promise.resolve(passengerProfile);
          }
          return Promise.resolve(null);
        }),
      })),
    };
    const service = new RideViewService(
      dataSourceMock as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.toDriverResponse(ride, null);

    expect(result.passenger?.photoUrl).toBeNull();
    expect(result.passenger?.ratingAverage).toBe('0.00');
    expect(result.passenger?.ratingCount).toBe(0);
  });

  it('debe devolver passenger null si el perfil no existe', async () => {
    const dataSourceMock = {
      getRepository: jest.fn((): unknown => ({
        findOne: jest.fn(() => Promise.resolve(null)),
      })),
    };
    const service = new RideViewService(
      dataSourceMock as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.toDriverResponse(ride, null);

    expect(result.passenger).toBeNull();
  });
});
