import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverRideOffersService } from './driver-ride-offers.service';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';

function queryBuilderReturning<T>(value: T) {
  const builder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(() => Promise.resolve(value)),
  };

  builder.where.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);

  return builder;
}

describe('DriverRideOffersService', () => {
  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  const offerId = '0847d580-6282-4a15-a967-95cb93650d36';

  function createContext() {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;

    const state = {
      driverProfileId,
      status: DriverOperationalStatus.AVAILABLE,
      lastSeenAt: new Date(),
    } as DriverOperationalState;

    const ride = {
      id: rideId,
      passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
      stateVersion: 0,

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

      estimatedFare: '5.00',
      passengerOfferFare: '7.00',
      agreedFare: null,

      currency: 'PEN',
      passengerNotes: null,

      searchExpiresAt: new Date(Date.now() + 240_000),

      driverAssignedAt: null,
    } as Ride;

    const offer = {
      id: offerId,
      rideId,
      driverProfileId,

      status: RideOfferStatus.OFFERED,

      distanceToOriginMeters: 420,
      dispatchRound: 1,
      searchRadiusMeters: 1000,

      offeredAt: new Date(),

      expiresAt: new Date(Date.now() + 60_000),

      proposedFare: null,
      proposedAt: null,

      respondedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      rejectionReason: null,

      ride,
    } as RideOffer;

    const profileRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(profile)),

      findOne: jest.fn(() => Promise.resolve(profile)),
    };

    const stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),
    };

    const rideRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(ride)
        .mockResolvedValueOnce(null),
    };

    const offerRepository = {
      findOne: jest.fn(() => Promise.resolve(offer)),

      save: jest.fn((entity: RideOffer) => Promise.resolve(entity)),

      update: jest.fn(() =>
        Promise.resolve({
          affected: 1,
        }),
      ),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === Ride) {
          return rideRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
    };

    const dispatchService = {
      dispatchRide: jest.fn(() => Promise.resolve([])),
    };

    const transitionsService = {
      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    };

    const service = new DriverRideOffersService(
      dataSourceMock as unknown as DataSource,
      dispatchService as unknown as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
    );

    return {
      service,
      state,
      ride,
      offer,
    };
  }

  it('debe aceptar el precio del pasajero sin asignar todavía el viaje', async () => {
    const context = createContext();

    const result = await context.service.acceptOffer(userId, offerId);

    expect(result.status).toBe(RideOfferStatus.PROPOSED);

    expect(result.proposedFare).toBe('7.00');

    expect(context.offer.proposedAt).toBeInstanceOf(Date);

    expect(context.state.status).toBe(DriverOperationalStatus.AVAILABLE);

    expect(context.ride.status).toBe(RideStatus.SEARCHING_DRIVER);

    expect(context.ride.driverProfileId).toBeNull();

    expect(context.offer.expiresAt).toBe(context.ride.searchExpiresAt);
  });

  it.each(['6.00', '7.00', '8.00'])(
    'debe aceptar la contraoferta bidireccional %s sin asignar el viaje',
    async (proposedFare) => {
      const context = createContext();

      const result = await context.service.counterOffer(userId, offerId, {
        proposedFare,
      });

      expect(result.status).toBe(RideOfferStatus.PROPOSED);
      expect(result.proposedFare).toBe(proposedFare);
      expect(context.state.status).toBe(DriverOperationalStatus.AVAILABLE);
      expect(context.ride.status).toBe(RideStatus.SEARCHING_DRIVER);
      expect(context.ride.driverProfileId).toBeNull();
      expect(context.ride.agreedFare).toBeNull();
      expect(context.offer.expiresAt).toBe(context.ride.searchExpiresAt);
    },
  );

  it.each(['0', '10000', '7.000', 'NaN', 'Infinity'])(
    'debe mantener el rechazo del monto inválido %s',
    async (proposedFare) => {
      const context = createContext();

      await expect(
        context.service.counterOffer(userId, offerId, {
          proposedFare,
        }),
      ).rejects.toThrow('El precio propuesto no es válido');

      expect(context.offer.status).toBe(RideOfferStatus.OFFERED);
      expect(context.ride.driverProfileId).toBeNull();
      expect(context.state.status).toBe(DriverOperationalStatus.AVAILABLE);
    },
  );
});

describe('DriverRideOffersService - getPendingProposals', () => {
  const userIdA = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const driverProfileIdA = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  const driverProfileIdB = 'c8a2f9e0-2f7a-4a3b-9b6b-8e6b9c2f9a10';

  let idCounter = 0;

  function nextId(prefix: string): string {
    idCounter += 1;

    return `${prefix}-${idCounter.toString().padStart(4, '0')}`;
  }

  function buildRide(overrides: Partial<Ride> = {}): Ride {
    return {
      id: nextId('ride'),
      status: RideStatus.SEARCHING_DRIVER,
      searchExpiresAt: new Date(Date.now() + 120_000),

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

      estimatedFare: '5.99',
      passengerOfferFare: '4.00',
      currency: 'PEN',

      ...overrides,
    } as Ride;
  }

  function buildOffer(overrides: Partial<RideOffer> = {}): RideOffer {
    const ride = overrides.ride ?? buildRide();

    return {
      id: nextId('offer'),
      rideId: ride.id,
      driverProfileId: driverProfileIdA,

      status: RideOfferStatus.PROPOSED,

      distanceToOriginMeters: 500,

      proposedFare: '4.50',
      proposedAt: new Date(Date.now() - 5_000),

      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 10_000),

      ride,

      ...overrides,
    } as RideOffer;
  }

  /*
   * Reproduce, en memoria, exactamente los filtros que
   * el servicio envía a TypeORM (driverProfileId, status,
   * expiresAt MoreThan) para poder caracterizar el
   * comportamiento sin depender de una base de datos real.
   */
  function findMatchingOffers(
    fixtures: RideOffer[],
    where: {
      driverProfileId: string;
      status: RideOfferStatus;
      expiresAt: { type: string; value: Date };
    },
  ): RideOffer[] {
    return fixtures
      .filter(
        (offer) =>
          offer.driverProfileId === where.driverProfileId &&
          offer.status === where.status &&
          (where.expiresAt.type !== 'moreThan' ||
            offer.expiresAt.getTime() > where.expiresAt.value.getTime()),
      )
      .sort((a, b) => {
        const byExpiry = a.expiresAt.getTime() - b.expiresAt.getTime();

        if (byExpiry !== 0) {
          return byExpiry;
        }

        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  function createContext(fixtures: RideOffer[]) {
    const profile = {
      id: driverProfileIdA,
      userId: userIdA,
      status: DriverStatus.APPROVED,
    } as DriverProfile;

    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profile)),
    };

    const offerRepository = {
      update: jest.fn(() =>
        Promise.resolve({
          affected: 0,
        }),
      ),

      find: jest.fn(
        (options: {
          where: {
            driverProfileId: string;
            status: RideOfferStatus;
            expiresAt: { type: string; value: Date };
          };
        }) => Promise.resolve(findMatchingOffers(fixtures, options.where)),
      ),
    };

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        throw new Error('Repositorio inesperado: ' + String(entity));
      }),

      transaction: jest.fn(),
    };

    const dispatchService = {
      dispatchRide: jest.fn(() => Promise.resolve([])),
    };

    const transitionsService = {
      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    };

    const service = new DriverRideOffersService(
      dataSourceMock as unknown as DataSource,
      dispatchService as unknown as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
    );

    return {
      service,
      profile,
      profileRepository,
      offerRepository,
      dataSourceMock,
    };
  }

  it('devuelve [] cuando no hay propuestas PROPOSED', async () => {
    const context = createContext([]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);
  });

  it('devuelve una propuesta válida con el DTO esperado', async () => {
    const ride = buildRide();

    const offer = buildOffer({
      ride,
      proposedFare: '4.50',
    });

    const context = createContext([offer]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      offerId: offer.id,
      rideId: ride.id,
      status: RideOfferStatus.PROPOSED,
      proposedFare: '4.50',
      passengerOfferFare: '4.00',
      estimatedFare: '5.99',
      currency: 'PEN',
      expiresAt: offer.expiresAt,
      distanceToOriginMeters: 500,
      origin: {
        latitude: -6.4877,
        longitude: -76.3599,
        address: 'Jr. Lima 250, Tarapoto',
      },
      destination: {
        latitude: -6.4812,
        longitude: -76.3655,
        address: 'Plaza de Armas de Morales',
      },
    });
  });

  it('devuelve las 3 propuestas PROPOSED simultáneas del mismo conductor', async () => {
    const offers = [buildOffer(), buildOffer(), buildOffer()];

    const context = createContext(offers);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toHaveLength(3);

    expect(new Set(result.map((proposal) => proposal.offerId))).toEqual(
      new Set(offers.map((offer) => offer.id)),
    );
  });

  it('ordena por expiresAt ascendente y createdAt como desempate', async () => {
    const now = Date.now();

    const soonest = buildOffer({
      expiresAt: new Date(now + 30_000),
    });

    const latestSameExpiry = buildOffer({
      expiresAt: new Date(now + 90_000),
      createdAt: new Date(now - 1_000),
    });

    const earliestSameExpiry = buildOffer({
      expiresAt: new Date(now + 90_000),
      createdAt: new Date(now - 20_000),
    });

    const context = createContext([
      latestSameExpiry,
      soonest,
      earliestSameExpiry,
    ]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result.map((proposal) => proposal.offerId)).toEqual([
      soonest.id,
      earliestSameExpiry.id,
      latestSameExpiry.id,
    ]);
  });

  it('no devuelve una PROPOSED vencida (expiración lazy)', async () => {
    const expired = buildOffer({
      expiresAt: new Date(Date.now() - 1_000),
    });

    const context = createContext([expired]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);

    /*
     * El servicio reutiliza la misma expiración lazy que
     * "active": marca EXPIRED antes de consultar.
     */
    expect(context.offerRepository.update).toHaveBeenCalledTimes(1);

    const [whereArg, setArg] = context.offerRepository.update.mock.calls[0] as [
      {
        driverProfileId: string;
        status: { type: string; value: RideOfferStatus[] };
        expiresAt: { type: string; value: Date };
      },
      { status: RideOfferStatus },
    ];

    expect(whereArg.driverProfileId).toBe(driverProfileIdA);
    expect(whereArg.status.type).toBe('in');
    expect(whereArg.status.value).toEqual([
      RideOfferStatus.OFFERED,
      RideOfferStatus.PROPOSED,
    ]);
    expect(whereArg.expiresAt.type).toBe('lessThanOrEqual');
    expect(setArg.status).toBe(RideOfferStatus.EXPIRED);
  });

  it('no mezcla OFFERED, ACCEPTED, REJECTED, EXPIRED ni CANCELLED', async () => {
    const ride = buildRide();

    const proposed = buildOffer({
      ride,
    });

    const others = [
      RideOfferStatus.OFFERED,
      RideOfferStatus.ACCEPTED,
      RideOfferStatus.REJECTED,
      RideOfferStatus.EXPIRED,
      RideOfferStatus.CANCELLED,
    ].map((status) =>
      buildOffer({
        ride,
        status,
      }),
    );

    const context = createContext([proposed, ...others]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toHaveLength(1);
    expect(result[0].offerId).toBe(proposed.id);
    expect(result[0].status).toBe(RideOfferStatus.PROPOSED);
  });

  it('deja de devolver una PROPOSED que el pasajero canceló (CANCELLED)', async () => {
    const ride = buildRide();

    const cancelledByPassenger = buildOffer({
      ride,
      status: RideOfferStatus.CANCELLED,
      cancelledAt: new Date(),
    });

    const context = createContext([cancelledByPassenger]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);
  });

  it('deja de devolver una PROPOSED que el pasajero seleccionó (ACCEPTED)', async () => {
    const ride = buildRide();

    const selected = buildOffer({
      ride,
      status: RideOfferStatus.ACCEPTED,
      acceptedAt: new Date(),
    });

    const context = createContext([selected]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);
  });

  it('nunca devuelve propuestas de otro conductor (ownership)', async () => {
    const offerOfDriverB = buildOffer({
      driverProfileId: driverProfileIdB,
    });

    const context = createContext([offerOfDriverB]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);

    const [findArg] = context.offerRepository.find.mock.calls[0] as [
      { where: { driverProfileId: string } },
    ];

    expect(findArg.where.driverProfileId).toBe(driverProfileIdA);
  });

  it('no acepta un driverProfileId distinto aunque exista en la misma ride', async () => {
    const ride = buildRide();

    const mine = buildOffer({
      ride,
      driverProfileId: driverProfileIdA,
    });

    const someoneElses = buildOffer({
      ride,
      driverProfileId: driverProfileIdB,
    });

    const context = createContext([mine, someoneElses]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toHaveLength(1);
    expect(result[0].offerId).toBe(mine.id);
  });

  it('descarta defensivamente una PROPOSED cuyo ride ya no está en negociación', async () => {
    const assignedRide = buildRide({
      status: RideStatus.DRIVER_ASSIGNED,
    });

    const staleProposal = buildOffer({
      ride: assignedRide,
    });

    const context = createContext([staleProposal]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);
  });

  it('descarta defensivamente una PROPOSED cuyo ride ya venció su búsqueda', async () => {
    const expiredSearchRide = buildRide({
      searchExpiresAt: new Date(Date.now() - 1_000),
    });

    const staleProposal = buildOffer({
      ride: expiredSearchRide,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const context = createContext([staleProposal]);

    const result = await context.service.getPendingProposals(userIdA);

    expect(result).toEqual([]);
  });

  it('no consulta ni modifica el estado operacional del conductor', async () => {
    const context = createContext([buildOffer()]);

    await context.service.getPendingProposals(userIdA);

    const queriedEntities = context.dataSourceMock.getRepository.mock.calls.map(
      (call: unknown[]) => call[0],
    );

    expect(queriedEntities).not.toContain(DriverOperationalState);
  });

  it('no cambia el estado operacional a BUSY al solo consultar', async () => {
    const context = createContext([buildOffer()]);

    await expect(
      context.service.getPendingProposals(userIdA),
    ).resolves.not.toThrow();

    expect(context.dataSourceMock.transaction).not.toHaveBeenCalled();
  });
});
