import {
  calculateRideSearchExpiresAt,
  getEffectiveSearchRadiusMeters,
  MAX_SEARCH_RADIUS_METERS,
  RIDE_DISPATCH_INTERVAL_MS,
  RIDE_SEARCH_RADII_METERS,
  RIDE_SEARCH_TTL_MS,
} from './ride-matching.constants';

describe('Ride matching constants', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('debe compartir una búsqueda global de cinco minutos (G3B2)', () => {
    expect(RIDE_SEARCH_TTL_MS).toBe(300_000);
    expect(calculateRideSearchExpiresAt(now).getTime() - now.getTime()).toBe(
      300_000,
    );
  });

  it('debe definir la cadencia de dispatch en 60 segundos, independiente del deadline global', () => {
    expect(RIDE_DISPATCH_INTERVAL_MS).toBe(60_000);
    expect(RIDE_DISPATCH_INTERVAL_MS).not.toBe(RIDE_SEARCH_TTL_MS);
  });

  it('debe usar los radios 2/5/10 km (G3B2)', () => {
    expect(RIDE_SEARCH_RADII_METERS).toEqual([2_000, 5_000, 10_000]);
  });

  describe('getEffectiveSearchRadiusMeters (G3C-lite + G3B2)', () => {
    it('debe devolver el radio correspondiente a cada ronda antes del máximo', () => {
      expect(getEffectiveSearchRadiusMeters(0)).toBe(2_000);
      expect(getEffectiveSearchRadiusMeters(1)).toBe(5_000);
      expect(getEffectiveSearchRadiusMeters(2)).toBe(10_000);
    });

    it('debe reutilizar el último radio para cualquier ronda por encima del máximo, sin inventar uno mayor', () => {
      expect(getEffectiveSearchRadiusMeters(3)).toBe(10_000);
      expect(getEffectiveSearchRadiusMeters(4)).toBe(10_000);
      expect(getEffectiveSearchRadiusMeters(100)).toBe(10_000);
      expect(getEffectiveSearchRadiusMeters(3)).toBe(
        RIDE_SEARCH_RADII_METERS[RIDE_SEARCH_RADII_METERS.length - 1],
      );
    });

    it('debe ser defensivo ante valores negativos', () => {
      expect(getEffectiveSearchRadiusMeters(-1)).toBe(2_000);
    });
  });

  describe('MAX_SEARCH_RADIUS_METERS (G3B2)', () => {
    it('debe ser el último elemento de RIDE_SEARCH_RADII_METERS, sin segunda fuente de verdad', () => {
      expect(MAX_SEARCH_RADIUS_METERS).toBe(10_000);
      expect(MAX_SEARCH_RADIUS_METERS).toBe(
        RIDE_SEARCH_RADII_METERS[RIDE_SEARCH_RADII_METERS.length - 1],
      );
    });
  });
});
