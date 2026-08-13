import {
  calculateRideSearchExpiresAt,
  RIDE_DISPATCH_INTERVAL_MS,
  RIDE_SEARCH_TTL_MS,
} from './ride-matching.constants';

describe('Ride matching constants', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('debe compartir una búsqueda global de cuatro minutos', () => {
    expect(RIDE_SEARCH_TTL_MS).toBe(240_000);
    expect(calculateRideSearchExpiresAt(now).getTime() - now.getTime()).toBe(
      240_000,
    );
  });

  it('debe definir la cadencia de dispatch en 60 segundos, independiente del deadline global', () => {
    expect(RIDE_DISPATCH_INTERVAL_MS).toBe(60_000);
    expect(RIDE_DISPATCH_INTERVAL_MS).not.toBe(RIDE_SEARCH_TTL_MS);
  });
});
