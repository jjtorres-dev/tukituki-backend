import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideRatingReviewerRole } from '../enums/ride-rating-reviewer-role.enum';
import { RideRatingTag } from '../enums/ride-rating-tag.enum';

export class RideRatingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideRatingReviewerRole })
  reviewerRole!: RideRatingReviewerRole;

  @ApiProperty({ minimum: 1, maximum: 5 })
  score!: number;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty({ enum: RideRatingTag, isArray: true })
  tags!: RideRatingTag[];

  @ApiProperty({ example: '4.85' })
  subjectRatingAverage!: string;

  @ApiProperty()
  subjectRatingCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
