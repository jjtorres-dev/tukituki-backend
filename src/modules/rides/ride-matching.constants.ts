import { RideStatus } from './enums/ride-status.enum';

export const RIDE_SEARCH_TTL_MS = 4 * 60 * 1000;
export const RIDE_OFFER_BATCH_SIZE = 5;
export const RIDE_MATCHING_CANDIDATE_LIMIT = 25;

/*
 * G3B1 - oferta persistente.
 *
 * Tiempo mínimo entre rondas automáticas de matchmaking para un
 * mismo Ride (ver RideDispatchWorker.findDueRides y
 * RideDispatchService.prepareDispatch).
 *
 * Responsabilidad EXCLUSIVA: cadencia de dispatch.
 *
 * NO controla:
 * - RideOffer.expiresAt (ver Ride.searchExpiresAt, asignado
 *   directamente al crear cada OFFERED);
 * - Ride.searchExpiresAt / RIDE_SEARCH_TTL_MS;
 * - presencia o frescura de ubicación del Driver;
 * - TTL de Redis;
 * - notificaciones FCM.
 */
export const RIDE_DISPATCH_INTERVAL_MS = 60 * 1000;

export function calculateRideSearchExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RIDE_SEARCH_TTL_MS);
}

export const RIDE_SEARCH_RADII_METERS: readonly number[] = [
  1_000, 2_000, 3_000,
];

/*
 * G3C-lite - continuar matchmaking tras el radio máximo.
 *
 * Punto único para traducir "cuántas rondas ya se intentaron" al
 * radio que corresponde usar. Antes del último elemento, cada ronda
 * usa el radio siguiente del array. Una vez alcanzado el último
 * elemento, los reintentos siguientes REUTILIZAN ese mismo radio
 * máximo — nunca se inventa un radio mayor.
 *
 * Completamente genérico: cuando RIDE_SEARCH_RADII_METERS cambie
 * (G3B2), este helper sigue funcionando sin modificarse.
 */
export function getEffectiveSearchRadiusMeters(dispatchRound: number): number {
  const index = Math.min(
    Math.max(dispatchRound, 0),
    RIDE_SEARCH_RADII_METERS.length - 1,
  );

  return RIDE_SEARCH_RADII_METERS[index];
}

export const DRIVER_PRESENCE_MAX_AGE_MS = 90_000;
export const DRIVER_LOCATION_MAX_AGE_MS = 45_000;

export const ACTIVE_DRIVER_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];
