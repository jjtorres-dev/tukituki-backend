import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideRatingTag } from '../enums/ride-rating-tag.enum';

export class SubmitRideRatingDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Conducción segura y trato amable',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({
    enum: RideRatingTag,
    isArray: true,
    maxItems: 5,
    example: [RideRatingTag.SAFE_DRIVING, RideRatingTag.FRIENDLY],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(RideRatingTag, { each: true })
  tags?: RideRatingTag[];
}
