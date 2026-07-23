import { BadRequestException } from '@nestjs/common';

import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { CancellationFeeCalculatorService } from './cancellation-fee-calculator.service';

describe('CancellationFeeCalculatorService', () => {
  const service = new CancellationFeeCalculatorService();

  it('no cobra dentro del periodo de gracia', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.DRIVER_ASSIGNED,
      driverAssignedAt: new Date('2026-07-23T15:00:00.000Z'),
      cancellationGracePeriodSeconds: 60,
      cancellationAssignedFee: '1.00',
    });

    expect(
      service.calculatePassengerFee(ride, new Date('2026-07-23T15:00:30.000Z')),
    ).toEqual({ fee: '0.00', gracePeriodExpired: false });
  });

  it('cobra desde el instante exacto en que termina el periodo de gracia', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.DRIVER_ASSIGNED,
      driverAssignedAt: new Date('2026-07-23T15:00:00.000Z'),
      cancellationGracePeriodSeconds: 60,
      cancellationAssignedFee: '1.00',
    });

    expect(
      service.calculatePassengerFee(ride, new Date('2026-07-23T15:01:00.000Z')),
    ).toEqual({ fee: '1.00', gracePeriodExpired: true });
  });

  it('cobra la tarifa asignada después del periodo de gracia', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.DRIVER_ASSIGNED,
      driverAssignedAt: new Date('2026-07-23T15:00:00.000Z'),
      cancellationGracePeriodSeconds: 60,
      cancellationAssignedFee: '1.00',
    });

    expect(
      service.calculatePassengerFee(ride, new Date('2026-07-23T15:01:01.000Z')),
    ).toEqual({ fee: '1.00', gracePeriodExpired: true });
  });

  it('no cobra mientras el viaje busca conductor', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.SEARCHING_DRIVER,
    });

    expect(service.calculatePassengerFee(ride, new Date())).toEqual({
      fee: '0.00',
      gracePeriodExpired: false,
    });
  });

  it('usa la tarifa de conductor en camino', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.DRIVER_ARRIVING,
      cancellationArrivingFee: '1.75',
    });

    expect(service.calculatePassengerFee(ride, new Date())).toEqual({
      fee: '1.75',
      gracePeriodExpired: true,
    });
  });

  it('usa la tarifa de conductor llegado', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.DRIVER_ARRIVED,
      cancellationArrivedFee: '2.25',
    });

    expect(service.calculatePassengerFee(ride, new Date())).toEqual({
      fee: '2.25',
      gracePeriodExpired: true,
    });
  });

  it('lee las tarifas de no-show y compensación desde el snapshot', () => {
    const ride = Object.assign(new Ride(), {
      passengerNoShowFee: '2.80',
      driverNoShowCompensation: '1.60',
    });

    expect(service.passengerNoShowFee(ride)).toBe('2.80');
    expect(service.driverCompensation(ride)).toBe('1.60');
  });

  it('rechaza la cancelación estándar durante el viaje', () => {
    const ride = Object.assign(new Ride(), {
      status: RideStatus.IN_PROGRESS,
    });

    expect(() => service.calculatePassengerFee(ride, new Date())).toThrow(
      BadRequestException,
    );
  });
});
