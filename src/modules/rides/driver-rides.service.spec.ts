import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { RidePaymentStatus } from '../payments/enums/ride-payment-status.enum';
import { DriverRidesService } from './driver-rides.service';
import { DriverActiveRideResponseDto } from './dto/driver-active-ride-response.dto';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideViewService } from './ride-view.service';

describe('DriverRidesService', () => {
  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  it('debe devolver únicamente el viaje asignado al conductor', async () => {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const ride = {
      id: rideId,
      driverProfileId,
      status: RideStatus.DRIVER_ARRIVING,
    } as Ride;
    const location = {
      driverProfileId,
    } as DriverLocation;
    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profile)),
    };
    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
    };
    const locationRepository = {
      findOne: jest.fn(() => Promise.resolve(location)),
    };
    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) return profileRepository;
        if (entity === Ride) return rideRepository;
        if (entity === DriverLocation) return locationRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() => Promise.resolve([{ distanceMeters: '85.4' }])),
    };
    const viewService = {
      toDriverResponse: jest.fn(
        (entity: Ride, distance: number | null) =>
          ({
            id: entity.id,
            status: entity.status,
            distanceToOriginMeters: distance,
          }) as DriverActiveRideResponseDto,
      ),
    };
    const service = new DriverRidesService(
      dataSourceMock as unknown as DataSource,
      viewService as unknown as RideViewService,
    );

    const result = await service.getActiveRide(userId);

    expect(result.id).toBe(rideId);
    expect(result.distanceToOriginMeters).toBe(85);
  });

  it('debe ocultar un viaje que no pertenece al conductor', async () => {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() =>
          Promise.resolve(entity === DriverProfile ? profile : null),
        ),
      })),
    };
    const service = new DriverRidesService(
      dataSourceMock as unknown as DataSource,
      {} as RideViewService,
    );

    await expect(service.getRide(userId, rideId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('listPendingCashPayments', () => {
    const otherDriverProfileId = '9c1a2b3c-9999-4de2-bd9f-11f33d64da64';
    const passengerUserId = 'a1c2e3f4-1111-4de2-bd9f-11f33d64da64';

    interface FakePaymentRow {
      id: string;
      driverProfileId: string;
      status: RidePaymentStatus;
      method: PaymentMethod;
      amountDue: string;
      grossAmount: string;
      discountAmount: string;
      cashReceived: string | null;
      changeGiven: string | null;
      currency: string;
      passengerUserId: string;
      confirmedByDriverUserId: string | null;
      confirmedAt: Date | null;
      confirmationNotes: string | null;
      disputeReason: null;
      disputeDetail: null;
      disputedAt: null;
      resolvedByAdminUserId: null;
      resolvedAt: null;
      resolutionNotes: null;
      createdAt: Date;
      updatedAt: Date;
      rideId: string;
      ride: {
        id: string;
        status: RideStatus;
        originAddress: string;
        destinationAddress: string;
        completedAt: Date | null;
        finalFare: string | null;
        currency: string;
      };
    }

    function buildPaymentRow(options: {
      paymentId: string;
      driverProfileId: string;
      paymentStatus: RidePaymentStatus;
      rideId: string;
      rideStatus: RideStatus;
      completedAt: Date | null;
    }): FakePaymentRow {
      return {
        id: options.paymentId,
        driverProfileId: options.driverProfileId,
        status: options.paymentStatus,
        method: PaymentMethod.CASH,
        amountDue: '8.50',
        grossAmount: '8.50',
        discountAmount: '0.00',
        cashReceived: null,
        changeGiven: null,
        currency: 'PEN',
        passengerUserId,
        confirmedByDriverUserId: null,
        confirmedAt: null,
        confirmationNotes: null,
        disputeReason: null,
        disputeDetail: null,
        disputedAt: null,
        resolvedByAdminUserId: null,
        resolvedAt: null,
        resolutionNotes: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        rideId: options.rideId,
        ride: {
          id: options.rideId,
          status: options.rideStatus,
          originAddress: 'Jr. Lima 250, Tarapoto',
          destinationAddress: 'Plaza de Armas de Morales',
          completedAt: options.completedAt,
          finalFare: '8.50',
          currency: 'PEN',
        },
      };
    }

    interface FakeQueryBuilder {
      innerJoinAndSelect: (relation: string, alias: string) => FakeQueryBuilder;
      where: (
        expr: string,
        params: Record<string, unknown>,
      ) => FakeQueryBuilder;
      andWhere: (
        expr: string,
        params: Record<string, unknown>,
      ) => FakeQueryBuilder;
      orderBy: (sort: string, order: 'ASC' | 'DESC') => FakeQueryBuilder;
      addOrderBy: (sort: string, order: 'ASC' | 'DESC') => FakeQueryBuilder;
      getMany: () => Promise<FakePaymentRow[]>;
    }

    /**
     * Emula el WHERE/ANDWHERE reales del QueryBuilder aplicando los
     * mismos parámetros nombrados que produce el servicio
     * (`driverProfileId`, `paymentStatus`, `rideStatus`), sin
     * necesitar una base de datos real.
     */
    function createQueryBuilderMock(rows: FakePaymentRow[]): FakeQueryBuilder {
      let filtered = [...rows];

      const applyParams = (params: Record<string, unknown>) => {
        if ('driverProfileId' in params) {
          filtered = filtered.filter(
            (row) => row.driverProfileId === params.driverProfileId,
          );
        }
        if ('paymentStatus' in params) {
          filtered = filtered.filter(
            (row) => row.status === params.paymentStatus,
          );
        }
        if ('rideStatus' in params) {
          filtered = filtered.filter(
            (row) => row.ride.status === params.rideStatus,
          );
        }
      };

      const builder: FakeQueryBuilder = {
        innerJoinAndSelect: jest.fn(() => builder),
        where: jest.fn((_expr: string, params: Record<string, unknown>) => {
          applyParams(params);
          return builder;
        }),
        andWhere: jest.fn((_expr: string, params: Record<string, unknown>) => {
          applyParams(params);
          return builder;
        }),
        orderBy: jest.fn(() => builder),
        addOrderBy: jest.fn(() => builder),
        getMany: jest.fn(() =>
          Promise.resolve(
            [...filtered].sort((a, b) => {
              const aTime = a.ride.completedAt?.getTime() ?? 0;
              const bTime = b.ride.completedAt?.getTime() ?? 0;
              if (bTime !== aTime) return bTime - aTime;
              return b.id.localeCompare(a.id);
            }),
          ),
        ),
      };

      return builder;
    }

    function buildService(rows: FakePaymentRow[], profile: DriverProfile) {
      const profileRepository = {
        findOne: jest.fn(() => Promise.resolve(profile)),
      };
      const paymentRepository = {
        createQueryBuilder: jest.fn(() => createQueryBuilderMock(rows)),
      };
      const dataSourceMock = {
        getRepository: jest.fn((entity: unknown): unknown => {
          if (entity === DriverProfile) return profileRepository;
          return paymentRepository;
        }),
      };
      return new DriverRidesService(
        dataSourceMock as unknown as DataSource,
        {} as RideViewService,
      );
    }

    it('A: debe devolver un ride COMPLETED con payment PENDING del conductor', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const rows = [
        buildPaymentRow({
          paymentId: 'p1',
          driverProfileId,
          paymentStatus: RidePaymentStatus.PENDING,
          rideId: 'ride-1',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ];
      const service = buildService(rows, profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toHaveLength(1);
      expect(result[0].rideId).toBe('ride-1');
      expect(result[0].rideStatus).toBe(RideStatus.COMPLETED);
      expect(result[0].payment.status).toBe(RidePaymentStatus.PENDING);
      expect(result[0].payment.method).toBe(PaymentMethod.CASH);
    });

    it('B: un ride todavía ACTIVE no debe aparecer', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const rows = [
        buildPaymentRow({
          paymentId: 'p1',
          driverProfileId,
          paymentStatus: RidePaymentStatus.PENDING,
          rideId: 'ride-active',
          rideStatus: RideStatus.IN_PROGRESS,
          completedAt: null,
        }),
      ];
      const service = buildService(rows, profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toHaveLength(0);
    });

    it('C: COMPLETED + PAID no debe aparecer', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const rows = [
        buildPaymentRow({
          paymentId: 'p1',
          driverProfileId,
          paymentStatus: RidePaymentStatus.PAID,
          rideId: 'ride-paid',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ];
      const service = buildService(rows, profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toHaveLength(0);
    });

    it('D: COMPLETED + DISPUTED/VOIDED no debe aparecer como pendiente', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const rows = [
        buildPaymentRow({
          paymentId: 'p1',
          driverProfileId,
          paymentStatus: RidePaymentStatus.DISPUTED,
          rideId: 'ride-disputed',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T10:00:00Z'),
        }),
        buildPaymentRow({
          paymentId: 'p2',
          driverProfileId,
          paymentStatus: RidePaymentStatus.VOIDED,
          rideId: 'ride-voided',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ];
      const service = buildService(rows, profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toHaveLength(0);
    });

    it('E: un ride de otro conductor no debe aparecer', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const rows = [
        buildPaymentRow({
          paymentId: 'p1',
          driverProfileId: otherDriverProfileId,
          paymentStatus: RidePaymentStatus.PENDING,
          rideId: 'ride-other-driver',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ];
      const service = buildService(rows, profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toHaveLength(0);
    });

    it('F: múltiples pendientes se devuelven en orden determinista (más reciente primero)', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const rows = [
        buildPaymentRow({
          paymentId: 'p-old',
          driverProfileId,
          paymentStatus: RidePaymentStatus.PENDING,
          rideId: 'ride-old',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T08:00:00Z'),
        }),
        buildPaymentRow({
          paymentId: 'p-new',
          driverProfileId,
          paymentStatus: RidePaymentStatus.PENDING,
          rideId: 'ride-new',
          rideStatus: RideStatus.COMPLETED,
          completedAt: new Date('2026-01-01T12:00:00Z'),
        }),
      ];
      const service = buildService(rows, profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toHaveLength(2);
      expect(result[0].rideId).toBe('ride-new');
      expect(result[1].rideId).toBe('ride-old');
    });

    it('G: sin pendientes debe devolver una lista vacía sin error', async () => {
      const profile = {
        id: driverProfileId,
        userId,
        status: DriverStatus.APPROVED,
      } as DriverProfile;
      const service = buildService([], profile);

      const result = await service.listPendingCashPayments(userId);

      expect(result).toEqual([]);
    });
  });
});
