import { RideStatus } from './enums/ride-status.enum';
import { RideOfferStatus } from './enums/ride-offer-status.enum';

export const RIDE_OFFER_TTL_MS = 15_000;
export const RIDE_OFFER_BATCH_SIZE = 5;
export const RIDE_MATCHING_CANDIDATE_LIMIT = 25;

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

/*
 * Estados en los que el conductor todavía
 * puede responder a una negociación.
 */
export const DRIVER_ACTIONABLE_RIDE_OFFER_STATUSES: readonly RideOfferStatus[] =
  [RideOfferStatus.OFFERED, RideOfferStatus.PASSENGER_COUNTERED];

/*
 * Negociaciones que el pasajero debe seguir viendo,
 * tanto si tiene el turno como si espera al conductor.
 */
export const PASSENGER_VISIBLE_RIDE_OFFER_STATUSES: readonly RideOfferStatus[] =
  [RideOfferStatus.PROPOSED, RideOfferStatus.PASSENGER_COUNTERED];

/*
 * Toda oferta cuyo intercambio económico
 * todavía no terminó.
 *
 * Centralizar esta lista evita dejar propuestas
 * abiertas al expirar o cancelar un viaje.
 */
export const OPEN_RIDE_OFFER_STATUSES: readonly RideOfferStatus[] = [
  RideOfferStatus.OFFERED,
  RideOfferStatus.PROPOSED,
  RideOfferStatus.PASSENGER_COUNTERED,
];
