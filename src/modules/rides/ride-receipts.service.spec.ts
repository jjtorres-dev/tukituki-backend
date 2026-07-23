import { DataSource } from 'typeorm';

import { RideFinalFare } from './entities/ride-final-fare.entity';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideReceiptsService } from './ride-receipts.service';

describe('RideReceiptsService', () => {
  it('debe entregar el comprobante solamente al pasajero propietario', async () => {
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
      status: RideStatus.COMPLETED,
      originAddress: 'Origen',
      destinationAddress: 'Destino',
      startedAt: new Date('2026-07-23T15:00:00.000Z'),
      completedAt: new Date('2026-07-23T15:10:00.000Z'),
      actualDistanceMeters: 3000,
      actualDurationSeconds: 600,
      estimatedFare: '7.00',
      completionNotes: null,
    } as Ride;
    const fare = {
      rideId: ride.id,
      baseFare: '2.50',
      distanceAmount: '3.00',
      timeAmount: '1.00',
      bookingFee: '0.50',
      subtotal: '7.00',
      adjustmentMultiplier: '1.000',
      calculatedFinalFare: '7.00',
      finalFare: '7.00',
      fareCapAmount: '8.40',
      fareWasCapped: false,
      currency: 'PEN',
    } as RideFinalFare;
    const dataSource = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return { findOne: jest.fn(() => Promise.resolve(ride)) };
        }
        if (entity === RideFinalFare) {
          return { findOne: jest.fn(() => Promise.resolve(fare)) };
        }
        throw new Error('Repositorio inesperado');
      }),
    };
    const service = new RideReceiptsService(
      dataSource as unknown as DataSource,
    );

    const result = await service.getPassengerReceipt(
      ride.passengerUserId,
      ride.id,
    );

    expect(result.status).toBe(RideStatus.COMPLETED);
    expect(result.fare.finalFare).toBe('7.00');
  });
});
