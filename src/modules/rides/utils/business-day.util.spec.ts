import { resolveLocalDayWindow } from './business-day.util';

describe('resolveLocalDayWindow', () => {
  it('calcula la ventana UTC del 2026-08-10 en America/Lima', () => {
    const now = new Date('2026-08-10T15:30:00.000Z');

    const window = resolveLocalDayWindow(now);

    expect(window.businessDate).toBe('2026-08-10');
    expect(window.timezone).toBe('America/Lima');
    expect(window.startUtc.toISOString()).toBe('2026-08-10T05:00:00.000Z');
    expect(window.endUtc.toISOString()).toBe('2026-08-11T05:00:00.000Z');
  });

  it('el límite inicial (05:00:00.000Z) pertenece al día siguiente al de 04:59:59.999Z', () => {
    const justBefore = resolveLocalDayWindow(
      new Date('2026-08-11T04:59:59.999Z'),
    );

    const atBoundary = resolveLocalDayWindow(
      new Date('2026-08-11T05:00:00.000Z'),
    );

    expect(justBefore.businessDate).toBe('2026-08-10');
    expect(atBoundary.businessDate).toBe('2026-08-11');
  });

  it('el final de ventana es exclusivo: 2026-08-11T04:59:59.999Z sigue en el día anterior', () => {
    const window = resolveLocalDayWindow(new Date('2026-08-10T12:00:00.000Z'));

    const justInside = new Date('2026-08-11T04:59:59.999Z');
    const justOutside = new Date('2026-08-11T05:00:00.000Z');

    expect(justInside.getTime() < window.endUtc.getTime()).toBe(true);
    expect(justOutside.getTime() < window.endUtc.getTime()).toBe(false);
  });

  it('no depende del timezone del proceso (usa siempre America/Lima explícito)', () => {
    const originalTz = process.env.TZ;

    process.env.TZ = 'UTC';

    try {
      const window = resolveLocalDayWindow(
        new Date('2026-08-10T15:30:00.000Z'),
      );

      expect(window.startUtc.toISOString()).toBe('2026-08-10T05:00:00.000Z');
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('respeta un timezone explícito distinto cuando se solicita', () => {
    const window = resolveLocalDayWindow(
      new Date('2026-08-10T15:30:00.000Z'),
      'UTC',
    );

    expect(window.businessDate).toBe('2026-08-10');
    expect(window.startUtc.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(window.endUtc.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });
});
