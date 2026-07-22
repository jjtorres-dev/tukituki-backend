import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ServiceZoneSummaryDto } from '../../service-zones/dto/service-zone-response.dto';
import { FareRuleStatus } from '../enums/fare-rule-status.enum';

export class FareRuleResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  serviceZoneId!: string;

  @ApiPropertyOptional({
    type: ServiceZoneSummaryDto,
    nullable: true,
  })
  serviceZone!: ServiceZoneSummaryDto | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  baseFare!: string;

  @ApiProperty()
  minimumFare!: string;

  @ApiProperty()
  pricePerKm!: string;

  @ApiProperty()
  pricePerMinute!: string;

  @ApiProperty()
  bookingFee!: string;

  @ApiProperty()
  waitingPricePerMinute!: string;

  @ApiProperty()
  cancellationFee!: string;

  @ApiProperty()
  nightMultiplier!: string;

  @ApiProperty()
  rainMultiplier!: string;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiProperty({
    enum: FareRuleStatus,
  })
  status!: FareRuleStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  effectiveFrom!: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  effectiveUntil!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;
}

export class FareRuleListResponseDto {
  @ApiProperty({
    type: FareRuleResponseDto,
    isArray: true,
  })
  items!: FareRuleResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}
