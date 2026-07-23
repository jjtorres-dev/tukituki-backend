import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareQuoteStatus } from '../fares/enums/fare-quote-status.enum';
import { FareRule } from '../fares/entities/fare-rule.entity';
import { FareRuleStatus } from '../fares/enums/fare-rule-status.enum';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { PassengerRideResponseDto } from './dto/passenger-ride-response.dto';
import { RideStatusHistory } from './entities/ride-status-history.entity';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { PassengerRidesService } from './passenger-rides.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';
import { RideViewService } from './ride-view.service';

describe('PassengerRidesService', () => {
  const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const quoteId = '1f66359e-d183-494d-a921-a19edbfbe2b9';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  let service: PassengerRidesService;
  let savedRide: Ride | undefined;
  let savedHistory: RideStatusHistory | undefined;
  let transitionsService: {
    cancelByPassenger: jest.Mock;
    expireSearchingRide: jest.Mock;
    expireWithinTransaction: jest.Mock;
  };
  let dispatchService: { dispatchRide: jest.Mock };

  beforeEach(() => {
    savedRide = undefined;
    savedHistory = undefined;

    const passenger = {
      id: passengerUserId,
      roles: [UserRole.PASSENGER],
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
    } as User;
    const quote = {
      id: quoteId,
      passengerUserId,
      fareRuleId: 'd2e188bd-681a-4f19-9d47-f4b6526ef311',
      originZoneId: '7d37cc0a-bbbe-4cd1-a244-b8eca8350012',
      destinationZoneId: '1d2edb48-b408-46b5-b312-44e89acd2bb4',
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
      durationSeconds: 720,
      estimatedFare: '7.40',
      currency: 'PEN',
      status: FareQuoteStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 300_000),
      usedAt: null,
    } as FareQuote;
    const zone = {
      status: ServiceZoneStatus.ACTIVE,
    } as ServiceZone;
    const fareRule = {
      status: FareRuleStatus.ACTIVE,
    } as FareRule;

    const userRepository = {
      findOne: jest.fn(() => Promise.resolve(passenger)),
    };
    const quoteRepository = {
      findOne: jest.fn(() => Promise.resolve(quote)),
      save: jest.fn((entity: FareQuote) => Promise.resolve(entity)),
    };
    const zoneRepository = {
      findOne: jest.fn(() => Promise.resolve(zone)),
    };
    const fareRuleRepository = {
      findOne: jest.fn(() => Promise.resolve(fareRule)),
    };
    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((input: Partial<Ride>) => input as Ride),
      save: jest.fn((entity: Ride) => {
        savedRide = {
          ...entity,
          id: entity.id ?? rideId,
          createdAt: entity.createdAt ?? new Date(),
          updatedAt: entity.updatedAt ?? new Date(),
        };
        return Promise.resolve(savedRide);
      }),
    };
    const historyRepository = {
      create: jest.fn(
        (input: Partial<RideStatusHistory>) => input as RideStatusHistory,
      ),
      save: jest.fn((entity: RideStatusHistory) => {
        savedHistory = entity;
        return Promise.resolve(entity);
      }),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === User) return userRepository;
        if (entity === FareQuote) return quoteRepository;
        if (entity === ServiceZone) return zoneRepository;
        if (entity === FareRule) return fareRuleRepository;
        if (entity === Ride) return rideRepository;
        if (entity === RideStatusHistory) return historyRepository;
        return { update: jest.fn(() => Promise.resolve({ affected: 0 })) };
      }),
    };
    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
      getRepository: jest.fn(() => rideRepository),
    };

    dispatchService = {
      dispatchRide: jest.fn(() => Promise.resolve([])),
    };
    transitionsService = {
      cancelByPassenger: jest.fn(),
      expireSearchingRide: jest.fn(() => Promise.resolve(true)),
      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    };
    const viewService = {
      toPassengerResponse: jest.fn((ride: Ride) =>
        Promise.resolve({
          id: ride.id,
          status: ride.status,
        } as PassengerRideResponseDto),
      ),
    };

    service = new PassengerRidesService(
      dataSourceMock as unknown as DataSource,
      dispatchService as unknown as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
      viewService as unknown as RideViewService,
    );
  });

  it('debe crear el viaje, registrar estado inicial e iniciar matching', async () => {
    const result = await service.createRide(passengerUserId, {
      fareQuoteId: quoteId,
      passengerNotes: 'Estoy frente a la puerta principal',
    });

    expect(savedRide?.status).toBe(RideStatus.SEARCHING_DRIVER);
    expect(savedRide?.stateVersion).toBe(0);
    expect(savedRide?.driverArrivingAt).toBeNull();
    expect(savedHistory?.previousStatus).toBeNull();
    expect(savedHistory?.newStatus).toBe(RideStatus.SEARCHING_DRIVER);
    expect(dispatchService.dispatchRide).toHaveBeenCalledWith(rideId);
    expect(result.id).toBe(rideId);
  });

  it('debe delegar la cancelación a la máquina central de estados', async () => {
    const cancelledRide = {
      id: rideId,
      status: RideStatus.CANCELLED,
    } as Ride;
    transitionsService.cancelByPassenger.mockResolvedValue(cancelledRide);

    const result = await service.cancelRide(passengerUserId, rideId, {
      reason: 'Ya no necesito el viaje',
    });

    expect(transitionsService.cancelByPassenger).toHaveBeenCalledWith(
      passengerUserId,
      rideId,
      'Ya no necesito el viaje',
    );
    expect(result.status).toBe(RideStatus.CANCELLED);
  });
});
