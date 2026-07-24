import { BadRequestException } from '@nestjs/common';

import { resolveOperationalPeriod } from './operational-period.util';

describe('resolveOperationalPeriod', () => {
  it('usa los últimos 30 días cuando no se proporciona un rango', () => {
    const now = new Date('2026-07-23T18:00:00.000Z');

    const result = resolveOperationalPeriod(undefined, undefined, now);

    expect(result.dateTo).toEqual(now);
    expect(result.dateFrom.toISOString()).toBe('2026-06-23T18:00:00.000Z');
  });

  it('rechaza un rango invertido', () => {
    expect(() =>
      resolveOperationalPeriod(
        '2026-07-24T00:00:00.000Z',
        '2026-07-23T00:00:00.000Z',
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza rangos mayores a 366 días', () => {
    expect(() =>
      resolveOperationalPeriod(
        '2025-01-01T00:00:00.000Z',
        '2026-07-23T00:00:00.000Z',
      ),
    ).toThrow('El rango máximo permitido');
  });
});
