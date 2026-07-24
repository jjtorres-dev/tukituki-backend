import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { OperationalMetricInterval } from './enums/operational-metric-interval.enum';
import { OperationalMetricsService } from './operational-metrics.service';

describe('OperationalMetricsService', () => {
  it('consolida los indicadores del tablero y normaliza sus valores', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          total: '10',
          active: '2',
          completed: '6',
          cancelled: '1',
          expired: '1',
          uniquePassengers: '8',
          uniqueDrivers: '5',
          grossFare: '75.5',
          averageFinalFare: '12.583',
          averageMatchingSeconds: '42.678',
          averagePickupSeconds: '181.2',
          averageRideSeconds: '605',
        },
      ])
      .mockResolvedValueOnce([{ charged: '3.5', waived: '1' }])
      .mockResolvedValueOnce([{ incidents: '2', openIncidents: '1' }])
      .mockResolvedValueOnce([{ offline: '4', available: '3', busy: '2' }]);
    const service = new OperationalMetricsService({
      query,
    } as unknown as DataSource);

    const result = await service.dashboard({
      dateFrom: '2026-07-01T00:00:00.000Z',
      dateTo: '2026-07-23T00:00:00.000Z',
    });

    expect(result.rides).toMatchObject({
      total: 10,
      active: 2,
      completed: 6,
      completionRate: 60,
      cancellationRate: 10,
      uniqueDrivers: 5,
    });
    expect(result.finance).toEqual({
      grossFare: '75.50',
      averageFinalFare: '12.58',
      cancellationFeesCharged: '3.50',
      cancellationFeesWaived: '1.00',
      currency: 'PEN',
    });
    expect(result.timings.averageMatchingSeconds).toBe(42.68);
    expect(result.safety.openIncidents).toBe(1);
    expect(result.driverStates.available).toBe(3);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('limita las series horarias a 31 días', async () => {
    const service = new OperationalMetricsService({
      query: jest.fn(),
    } as unknown as DataSource);

    await expect(
      service.timeSeries({
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-07-23T00:00:00.000Z',
        interval: OperationalMetricInterval.HOUR,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('genera un CSV UTF-8 y neutraliza fórmulas de hojas de cálculo', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        rideId: '4aca7a5a-2b09-4af8-ae1b-6e572a6ca1dc',
        status: 'COMPLETED',
        requestedAt: '2026-07-23T10:00:00.000Z',
        driverAssignedAt: null,
        startedAt: null,
        completedAt: '2026-07-23T10:20:00.000Z',
        cancelledAt: null,
        originZone: 'Tarapoto',
        originAddress: '=HYPERLINK("malicioso")',
        destinationAddress: 'Hospital',
        estimatedFare: '8.00',
        finalFare: '8.50',
        currency: 'PEN',
        actualDistanceMeters: 2500,
        actualDurationSeconds: 1200,
      },
    ]);
    const service = new OperationalMetricsService({
      query,
    } as unknown as DataSource);

    const csv = await service.exportRidesCsv({
      dateFrom: '2026-07-01T00:00:00.000Z',
      dateTo: '2026-07-24T00:00:00.000Z',
      limit: 100,
    });

    expect(csv.startsWith('\uFEFFride_id,status')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""malicioso"")"`);
  });
});
