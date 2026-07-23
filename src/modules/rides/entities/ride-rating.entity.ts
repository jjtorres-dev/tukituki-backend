import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { RideRatingReviewerRole } from '../enums/ride-rating-reviewer-role.enum';
import { RideRatingTag } from '../enums/ride-rating-tag.enum';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_ratings' })
@Check('CHK_ride_ratings_score', '"score" BETWEEN 1 AND 5')
@Check(
  'CHK_ride_ratings_distinct_users',
  '"reviewer_user_id" <> "reviewed_user_id"',
)
@Index(
  'UQ_ride_ratings_direction',
  ['rideId', 'reviewerUserId', 'reviewedUserId'],
  { unique: true },
)
@Index('IDX_ride_ratings_reviewed_user_created_at', [
  'reviewedUserId',
  'createdAt',
])
@Index('IDX_ride_ratings_ride_id', ['rideId'])
export class RideRating {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'reviewer_user_id', type: 'uuid' })
  reviewerUserId!: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewerUser!: Relation<User>;

  @Column({ name: 'reviewed_user_id', type: 'uuid' })
  reviewedUserId!: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'reviewed_user_id' })
  reviewedUser!: Relation<User>;

  @Column({
    name: 'reviewer_role',
    type: 'enum',
    enum: RideRatingReviewerRole,
    enumName: 'ride_rating_reviewer_role_enum',
  })
  reviewerRole!: RideRatingReviewerRole;

  @Column({ type: 'smallint' })
  score!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment!: string | null;

  @Column({
    type: 'enum',
    enum: RideRatingTag,
    enumName: 'ride_rating_tag_enum',
    array: true,
    default: () => "'{}'",
  })
  tags!: RideRatingTag[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
