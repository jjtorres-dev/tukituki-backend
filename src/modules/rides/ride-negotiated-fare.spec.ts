import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { Ride } from './entities/ride.entity';
import { RideCompletionService } from './ride-completion.service';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideTransitionsService } from './ride-transitions.service';

interface FareCalculationResult {
  calculatedFinalFare: string;
  finalFare: string;
  fareCapAmount: string;
  fareWasCapped: boolean;
}

interface RideCompletionServiceTestAccess {
  calculateFinalFare(
    ride: Ride,
    distanceMeters: number,
    durationSeconds: number,
  ): FareCalculationResult;
}

describe('RideCompletionService - negotiated fare', () => {
  it('debe mantener agreedFare como precio final aunque la tarifa calculada sea diferente', () => {
    const configService = {
      get: jest.fn(() => '20'),
    };

    const service = new RideCompletionService(
      {} as DataSource,
      configService as unknown as ConfigService,
      {} as RideTransitionsService,
      {} as RideRealtimeService,
      {} as DriverAvailabilityRedisService,
    );

    const ride = {
      estimatedFare: '5.00',
      agreedFare: '6.00',

      pricingBaseFare: '2.50',
      pricingMinimumFare: '5.00',
      pricingPricePerKm: '1.00',
      pricingPricePerMinute: '0.10',
      pricingBookingFee: '0.50',
      pricingAdjustmentMultiplier: '1.000',

      pricingCurrency: 'PEN',
      pricingCalculationVersion: 'v1',
    } as Ride;

    const testAccess = service as unknown as RideCompletionServiceTestAccess;

    /*
     * Con esta distancia y tiempo,
     * la tarifa calculada será mayor
     * que S/ 6.00.
     */
    const result = testAccess.calculateFinalFare(ride, 5_000, 1_200);

    expect(Number(result.calculatedFinalFare)).toBeGreaterThan(6);

    expect(result.finalFare).toBe('6.00');

    expect(result.fareCapAmount).toBe('6.00');

    expect(result.fareWasCapped).toBe(false);
  });
});
