import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { GeographicPointDto } from '../../service-zones/dto/geographic-point.dto';

export class EstimateFareDto {
  @ApiProperty({
    type: GeographicPointDto,
  })
  @ValidateNested()
  @Type(() => GeographicPointDto)
  origin!: GeographicPointDto;

  @ApiProperty({
    type: GeographicPointDto,
  })
  @ValidateNested()
  @Type(() => GeographicPointDto)
  destination!: GeographicPointDto;

  @ApiProperty({
    example: 3200,
    minimum: 1,
    maximum: 100000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  distanceMeters!: number;

  @ApiProperty({
    example: 720,
    minimum: 1,
    maximum: 86400,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds!: number;

  @ApiPropertyOptional({
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isNight?: boolean;

  @ApiPropertyOptional({
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isRaining?: boolean;
}
