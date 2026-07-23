import { RideStatus } from './enums/ride-status.enum';

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
