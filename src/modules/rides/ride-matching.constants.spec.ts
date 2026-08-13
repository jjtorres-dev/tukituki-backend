import {
  calculateRideSearchExpiresAt,
  getEffectiveSearchRadiusMeters,
  RIDE_DISPATCH_INTERVAL_MS,
  RIDE_SEARCH_RADII_METERS,
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

  describe('getEffectiveSearchRadiusMeters (G3C-lite)', () => {
    it('debe devolver el radio correspondiente a cada ronda antes del máximo', () => {
      expect(getEffectiveSearchRadiusMeters(0)).toBe(1_000);
      expect(getEffectiveSearchRadiusMeters(1)).toBe(2_000);
      expect(getEffectiveSearchRadiusMeters(2)).toBe(3_000);
    });

    it('debe reutilizar el último radio para cualquier ronda por encima del máximo, sin inventar uno mayor', () => {
      expect(getEffectiveSearchRadiusMeters(3)).toBe(3_000);
      expect(getEffectiveSearchRadiusMeters(4)).toBe(3_000);
      expect(getEffectiveSearchRadiusMeters(100)).toBe(3_000);
      expect(getEffectiveSearchRadiusMeters(3)).toBe(
        RIDE_SEARCH_RADII_METERS[RIDE_SEARCH_RADII_METERS.length - 1],
      );
    });

    it('debe ser defensivo ante valores negativos', () => {
      expect(getEffectiveSearchRadiusMeters(-1)).toBe(1_000);
    });
  });
});
