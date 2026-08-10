import {
  calculateRideOfferExpiresAt,
  calculateRideSearchExpiresAt,
  RIDE_OFFER_TTL_MS,
  RIDE_SEARCH_TTL_MS,
} from './ride-matching.constants';

describe('Ride matching constants', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('debe dar 60 segundos para responder una oferta', () => {
    expect(RIDE_OFFER_TTL_MS).toBe(60_000);

    const searchExpiresAt = new Date(now.getTime() + RIDE_SEARCH_TTL_MS);
    const expiresAt = calculateRideOfferExpiresAt(now, searchExpiresAt);

    expect(expiresAt.getTime() - now.getTime()).toBe(60_000);
  });

  it('debe compartir una búsqueda global de cuatro minutos', () => {
    expect(RIDE_SEARCH_TTL_MS).toBe(240_000);
    expect(calculateRideSearchExpiresAt(now).getTime() - now.getTime()).toBe(
      240_000,
    );
  });

  it('no debe dejar una oferta vigente después del deadline global', () => {
    const searchExpiresAt = new Date(now.getTime() + 30_000);

    expect(calculateRideOfferExpiresAt(now, searchExpiresAt)).toEqual(
      searchExpiresAt,
    );
  });
});
