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

export const DRIVER_PRESENCE_MAX_AGE_MS = 90_000;
export const DRIVER_LOCATION_MAX_AGE_MS = 45_000;

export const ACTIVE_DRIVER_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];
