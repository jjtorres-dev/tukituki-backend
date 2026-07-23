import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VehicleType } from '../../drivers/enums/vehicle-type.enum';
import { CancellationFeeStatus } from '../../rides/enums/cancellation-fee-status.enum';
import { RideCancellationActor } from '../../rides/enums/ride-cancellation-actor.enum';
import { RideCancellationType } from '../../rides/enums/ride-cancellation-type.enum';
import { RideLocationRejectionReason } from '../../rides/enums/ride-location-rejection-reason.enum';
import { RideOfferStatus } from '../../rides/enums/ride-offer-status.enum';
import { RideRatingReviewerRole } from '../../rides/enums/ride-rating-reviewer-role.enum';
import { RideRatingTag } from '../../rides/enums/ride-rating-tag.enum';
import { RideStatusActor } from '../../rides/enums/ride-status-actor.enum';
import { RideStatus } from '../../rides/enums/ride-status.enum';
import { SafetyIncidentSeverity } from '../../safety/enums/safety-incident-severity.enum';
import { SafetyIncidentStatus } from '../../safety/enums/safety-incident-status.enum';
import { SafetyIncidentType } from '../../safety/enums/safety-incident-type.enum';

export class AdminRidePassengerSummaryDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  phoneE164!: string;

  @ApiPropertyOptional({ nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ratingAverage!: string | null;
}

export class AdminRideDriverSummaryDto {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  phoneE164!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty()
  ratingAverage!: string;
}

export class AdminRideVehicleSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  color!: string;

  @ApiProperty({ enum: VehicleType })
  vehicleType!: VehicleType;
}

export class AdminRideZoneSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class AdminRidePointDto {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  address!: string;
}

export class AdminRideRouteDto {
  @ApiProperty({ type: AdminRidePointDto })
  origin!: AdminRidePointDto;

  @ApiProperty({ type: AdminRidePointDto })
  destination!: AdminRidePointDto;

  @ApiProperty({ type: AdminRideZoneSummaryDto })
  originZone!: AdminRideZoneSummaryDto;

  @ApiProperty({ type: AdminRideZoneSummaryDto })
  destinationZone!: AdminRideZoneSummaryDto;

  @ApiProperty()
  estimatedDistanceMeters!: number;

  @ApiProperty()
  estimatedDurationSeconds!: number;
}

export class AdminRideFareSummaryDto {
  @ApiProperty()
  estimatedFare!: string;

  @ApiPropertyOptional({ nullable: true })
  finalFare!: string | null;

  @ApiProperty()
  currency!: string;
}

export class AdminRideCurrentLocationDto {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiPropertyOptional({ nullable: true })
  accuracy!: number | null;

  @ApiPropertyOptional({ nullable: true })
  heading!: number | null;

  @ApiPropertyOptional({ nullable: true })
  speed!: number | null;

  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;
}

export class AdminRideListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  stateVersion!: number;

  @ApiProperty({ type: AdminRidePassengerSummaryDto })
  passenger!: AdminRidePassengerSummaryDto;

  @ApiPropertyOptional({ type: AdminRideDriverSummaryDto, nullable: true })
  driver!: AdminRideDriverSummaryDto | null;

  @ApiPropertyOptional({ type: AdminRideVehicleSummaryDto, nullable: true })
  vehicle!: AdminRideVehicleSummaryDto | null;

  @ApiProperty({ type: AdminRideRouteDto })
  route!: AdminRideRouteDto;

  @ApiProperty({ type: AdminRideFareSummaryDto })
  fare!: AdminRideFareSummaryDto;

  @ApiPropertyOptional({ type: AdminRideCurrentLocationDto, nullable: true })
  currentDriverLocation!: AdminRideCurrentLocationDto | null;

  @ApiProperty()
  hasCancellation!: boolean;

  @ApiProperty()
  openSafetyIncidentCount!: number;

  @ApiProperty({ format: 'date-time' })
  requestedAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  driverAssignedAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class AdminRidePaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class AdminRideListResponseDto {
  @ApiProperty({ type: AdminRideListItemDto, isArray: true })
  items!: AdminRideListItemDto[];

  @ApiProperty({ type: AdminRidePaginationDto })
  pagination!: AdminRidePaginationDto;
}

export class AdminRidePricingSnapshotDto {
  @ApiPropertyOptional({ nullable: true })
  baseFare!: string | null;

  @ApiPropertyOptional({ nullable: true })
  minimumFare!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pricePerKm!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pricePerMinute!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bookingFee!: string | null;

  @ApiPropertyOptional({ nullable: true })
  adjustmentMultiplier!: string | null;

  @ApiPropertyOptional({ nullable: true })
  calculationVersion!: string | null;
}

export class AdminRideCompletionDto {
  @ApiPropertyOptional({ nullable: true })
  actualDistanceMeters!: number | null;

  @ApiPropertyOptional({ nullable: true })
  actualDurationSeconds!: number | null;

  @ApiPropertyOptional({ nullable: true })
  destinationArrivalDistanceMeters!: string | null;

  @ApiPropertyOptional({ nullable: true })
  calculatedFinalFare!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fareWasCapped!: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}

export class AdminRideTrackingDto {
  @ApiProperty()
  acceptedSamples!: number;

  @ApiProperty()
  rejectedSamples!: number;

  @ApiProperty()
  trackedDistanceMeters!: string;

  @ApiProperty()
  calculatedDurationSeconds!: number;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastReceivedSampleAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastAcceptedSampleAt!: Date | null;
}

export class AdminRideFinalFareDto {
  @ApiProperty()
  baseFare!: string;

  @ApiProperty()
  distanceAmount!: string;

  @ApiProperty()
  timeAmount!: string;

  @ApiProperty()
  bookingFee!: string;

  @ApiProperty()
  subtotal!: string;

  @ApiProperty()
  adjustmentMultiplier!: string;

  @ApiProperty()
  calculatedFinalFare!: string;

  @ApiProperty()
  finalFare!: string;

  @ApiProperty()
  fareCapAmount!: string;

  @ApiProperty()
  fareWasCapped!: boolean;

  @ApiProperty()
  currency!: string;
}

export class AdminRideCancellationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RideCancellationActor })
  actorType!: RideCancellationActor;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ApiProperty()
  reasonCode!: string;

  @ApiPropertyOptional({ nullable: true })
  reasonDetail!: string | null;

  @ApiProperty({ enum: RideStatus })
  rideStatusBefore!: RideStatus;

  @ApiProperty({ enum: RideCancellationType })
  cancellationType!: RideCancellationType;

  @ApiProperty()
  calculatedFee!: string;

  @ApiProperty()
  chargedFee!: string;

  @ApiProperty()
  waivedAmount!: string;

  @ApiProperty({ enum: CancellationFeeStatus })
  feeStatus!: CancellationFeeStatus;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AdminRideWaitingDto {
  @ApiProperty({ format: 'date-time' })
  waitingStartedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  noShowAvailableAt!: Date;

  @ApiProperty()
  requiredWaitingSeconds!: number;

  @ApiProperty()
  startDistanceMeters!: string;
}

export class AdminRideOfferDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverProfileId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty({ enum: RideOfferStatus })
  status!: RideOfferStatus;

  @ApiProperty()
  distanceToOriginMeters!: number;

  @ApiProperty()
  dispatchRound!: number;

  @ApiProperty()
  searchRadiusMeters!: number;

  @ApiProperty({ format: 'date-time' })
  offeredAt!: Date;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  respondedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectionReason!: string | null;
}

export class AdminRideSafetyIncidentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SafetyIncidentType })
  incidentType!: SafetyIncidentType;

  @ApiProperty({ enum: SafetyIncidentSeverity })
  severity!: SafetyIncidentSeverity;

  @ApiProperty({ enum: SafetyIncidentStatus })
  status!: SafetyIncidentStatus;

  @ApiProperty({ enum: RideStatusActor })
  reporterRole!: RideStatusActor;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class AdminRideRatingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RideRatingReviewerRole })
  reviewerRole!: RideRatingReviewerRole;

  @ApiProperty()
  score!: number;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty({ enum: RideRatingTag, isArray: true })
  tags!: RideRatingTag[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AdminRideDetailResponseDto {
  @ApiProperty({ type: AdminRideListItemDto })
  summary!: AdminRideListItemDto;

  @ApiPropertyOptional({ nullable: true })
  passengerNotes!: string | null;

  @ApiProperty()
  dispatchRound!: number;

  @ApiProperty({ format: 'date-time' })
  searchExpiresAt!: Date;

  @ApiProperty({ type: AdminRidePricingSnapshotDto })
  pricing!: AdminRidePricingSnapshotDto;

  @ApiProperty({ type: AdminRideCompletionDto })
  completion!: AdminRideCompletionDto;

  @ApiPropertyOptional({ type: AdminRideTrackingDto, nullable: true })
  tracking!: AdminRideTrackingDto | null;

  @ApiPropertyOptional({ type: AdminRideFinalFareDto, nullable: true })
  finalFare!: AdminRideFinalFareDto | null;

  @ApiPropertyOptional({ type: AdminRideCancellationDto, nullable: true })
  cancellation!: AdminRideCancellationDto | null;

  @ApiPropertyOptional({ type: AdminRideWaitingDto, nullable: true })
  waiting!: AdminRideWaitingDto | null;

  @ApiProperty({ type: AdminRideOfferDto, isArray: true })
  offers!: AdminRideOfferDto[];

  @ApiProperty({ type: AdminRideSafetyIncidentDto, isArray: true })
  safetyIncidents!: AdminRideSafetyIncidentDto[];

  @ApiProperty({ type: AdminRideRatingDto, isArray: true })
  ratings!: AdminRideRatingDto[];
}

export class AdminRideTimelineActorDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phoneE164!: string | null;
}

export class AdminRideTimelineItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ enum: RideStatus, nullable: true })
  previousStatus!: RideStatus | null;

  @ApiProperty({ enum: RideStatus })
  newStatus!: RideStatus;

  @ApiProperty({ enum: RideStatusActor })
  actorType!: RideStatusActor;

  @ApiProperty({ type: AdminRideTimelineActorDto })
  actor!: AdminRideTimelineActorDto;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;
}

export class AdminRideTimelineResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ type: AdminRideTimelineItemDto, isArray: true })
  items!: AdminRideTimelineItemDto[];
}

export class AdminRideLocationSampleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiPropertyOptional({ nullable: true })
  accuracy!: number | null;

  @ApiPropertyOptional({ nullable: true })
  heading!: number | null;

  @ApiPropertyOptional({ nullable: true })
  speed!: number | null;

  @ApiProperty()
  acceptedForMetrics!: boolean;

  @ApiPropertyOptional({ enum: RideLocationRejectionReason, nullable: true })
  rejectionReason!: RideLocationRejectionReason | null;

  @ApiPropertyOptional({ nullable: true })
  distanceFromPreviousMeters!: string | null;

  @ApiProperty()
  cumulativeDistanceMeters!: string;

  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  receivedAt!: Date;
}

export class AdminRideLocationListResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ type: AdminRideLocationSampleDto, isArray: true })
  items!: AdminRideLocationSampleDto[];

  @ApiProperty({ type: AdminRidePaginationDto })
  pagination!: AdminRidePaginationDto;
}
