/*
 * Cálculo del "día de negocio" local de un timezone IANA,
 * sin depender del timezone del proceso Node/Postgres.
 *
 * Node trae la base de datos ICU/IANA completa, así que
 * Intl.DateTimeFormat con `timeZone` explícito resuelve
 * el offset real de cualquier zona sin necesidad de una
 * librería externa (luxon/moment/dayjs).
 */

export const DEFAULT_BUSINESS_TIMEZONE = 'America/Lima';

export interface LocalDayWindow {
  /*
   * Fecha local (YYYY-MM-DD) del timezone indicado.
   */
  businessDate: string;

  timezone: string;

  /*
   * Inicio inclusivo, en UTC, de ese día local.
   */
  startUtc: Date;

  /*
   * Fin exclusivo, en UTC, de ese día local
   * (= inicio del día local siguiente).
   */
  endUtc: Date;
}

/*
 * Offset (en minutos, positivo al este de UTC) de `timeZone`
 * en el instante `date`. Se calcula formateando `date` como
 * si sus componentes de pared fueran UTC y comparando contra
 * el instante real.
 */
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  const wallClockAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return (wallClockAsUtc - date.getTime()) / 60_000;
}

/*
 * Fecha local (YYYY-MM-DD) de `date` en `timeZone`.
 */
function formatLocalDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseDateOnly(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateStr.split('-').map(Number);

  return { year, month, day };
}

function addCalendarDays(dateStr: string, days: number): string {
  const { year, month, day } = parseDateOnly(dateStr);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);

  return shifted.toISOString().slice(0, 10);
}

/*
 * Instante UTC correspondiente a las 00:00:00 locales de
 * `dateStr` en `timeZone`.
 */
function localMidnightToUtc(dateStr: string, timeZone: string): Date {
  const { year, month, day } = parseDateOnly(dateStr);
  const naiveUtcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(
    new Date(naiveUtcMidnight),
    timeZone,
  );

  return new Date(naiveUtcMidnight - offsetMinutes * 60_000);
}

/*
 * Ventana [startUtc, endUtc) del día local de `now` en
 * `timeZone`, con inicio inclusivo y fin exclusivo.
 */
export function resolveLocalDayWindow(
  now: Date,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): LocalDayWindow {
  const businessDate = formatLocalDate(now, timeZone);
  const nextBusinessDate = addCalendarDays(businessDate, 1);

  return {
    businessDate,
    timezone: timeZone,
    startUtc: localMidnightToUtc(businessDate, timeZone),
    endUtc: localMidnightToUtc(nextBusinessDate, timeZone),
  };
}
