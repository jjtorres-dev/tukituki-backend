import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { Ride } from './ride.entity';
import { RideOfferStatus } from '../enums/ride-offer-status.enum';

@Entity({
  name: 'ride_offers',
})
@Index('UQ_ride_offers_ride_driver', ['rideId', 'driverProfileId'], {
  unique: true,
})
@Index('UQ_ride_offers_accepted_ride', ['rideId'], {
  unique: true,
  where: `"status" = 'ACCEPTED'`,
})
@Index('IDX_ride_offers_driver_status', ['driverProfileId', 'status'])
@Index('IDX_ride_offers_ride_status', ['rideId', 'status'])
@Index('IDX_ride_offers_expires_at', ['expiresAt'])
export class RideOffer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'ride_id',
    type: 'uuid',
  })
  rideId!: string;

  @ManyToOne(() => Ride, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'ride_id',
  })
  ride!: Relation<Ride>;

  @Column({
    name: 'driver_profile_id',
    type: 'uuid',
  })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfile, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'driver_profile_id',
  })
  driverProfile!: Relation<DriverProfile>;

  @Column({
    type: 'enum',
    enum: RideOfferStatus,
    enumName: 'ride_offer_status_enum',
    default: RideOfferStatus.OFFERED,
  })
  status!: RideOfferStatus;

  @Column({
    name: 'distance_to_origin_meters',
    type: 'integer',
  })
  distanceToOriginMeters!: number;

  @Column({
    name: 'dispatch_round',
    type: 'smallint',
  })
  dispatchRound!: number;

  @Column({
    name: 'search_radius_meters',
    type: 'integer',
  })
  searchRadiusMeters!: number;

  @Column({
    name: 'offered_at',
    type: 'timestamptz',
  })
  offeredAt!: Date;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
  })
  expiresAt!: Date;

  /*
   * Precio que este conductor presenta
   * al pasajero.
   *
   * Puede ser exactamente passengerOfferFare
   * o una contraoferta.
   */
  @Column({
    name: 'proposed_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  proposedFare!: string | null;

  /*
   * Momento en que el conductor presentó
   * su propuesta económica.
   */
  @Column({
    name: 'proposed_at',
    type: 'timestamptz',
    nullable: true,
  })
  proposedAt!: Date | null;

  @Column({
    name: 'responded_at',
    type: 'timestamptz',
    nullable: true,
  })
  respondedAt!: Date | null;

  @Column({
    name: 'accepted_at',
    type: 'timestamptz',
    nullable: true,
  })
  acceptedAt!: Date | null;

  @Column({
    name: 'rejected_at',
    type: 'timestamptz',
    nullable: true,
  })
  rejectedAt!: Date | null;

  @Column({
    name: 'cancelled_at',
    type: 'timestamptz',
    nullable: true,
  })
  cancelledAt!: Date | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  rejectionReason!: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}
