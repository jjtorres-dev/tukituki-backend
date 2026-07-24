import {
  applyMultiplierToCents,
  calculateDistanceAmountCents,
  calculateTimeAmountCents,
  combineMultipliersScaledThree,
  formatCents,
  parseScaledDecimal,
} from './fixed-decimal.util';

describe('fixed-decimal.util', () => {
  it('debe convertir decimales a enteros escalados', () => {
    expect(parseScaledDecimal('2.50', 2)).toBe(250n);
    expect(parseScaledDecimal('1.1', 3)).toBe(1100n);
  });

  it('debe calcular el precio exacto por distancia', () => {
    expect(calculateDistanceAmountCents('1.0000', 3200)).toBe(320n);
  });

  it('debe calcular el precio exacto por tiempo', () => {
    expect(calculateTimeAmountCents('0.1000', 720)).toBe(120n);
  });

  it('debe combinar multiplicadores con redondeo', () => {
    const multiplier = combineMultipliersScaledThree(['1.150', '1.100']);

    expect(multiplier).toBe(1265n);
    expect(applyMultiplierToCents(740n, multiplier)).toBe(936n);
    expect(formatCents(936n)).toBe('9.36');
  });
  it('debe formatear importes negativos menores a una unidad', () => {
    expect(formatCents(-28n)).toBe('-0.28');
  });
});
