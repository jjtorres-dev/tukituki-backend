import { ApiProperty } from '@nestjs/swagger';

import { ServiceZoneSummaryDto } from '../../service-zones/dto/service-zone-response.dto';
import { FareQuoteStatus } from '../enums/fare-quote-status.enum';

export class FareQuoteLocationResponseDto {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  address!: string;
}

export class FareEstimateResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  quoteId!: string;

  @ApiProperty({
    enum: FareQuoteStatus,
  })
  quoteStatus!: FareQuoteStatus;

  @ApiProperty({
    format: 'uuid',
  })
  fareRuleId!: string;

  @ApiProperty({
    type: ServiceZoneSummaryDto,
  })
  originZone!: ServiceZoneSummaryDto;

  @ApiProperty({
    type: ServiceZoneSummaryDto,
  })
  destinationZone!: ServiceZoneSummaryDto;

  @ApiProperty({
    type: FareQuoteLocationResponseDto,
  })
  origin!: FareQuoteLocationResponseDto;

  @ApiProperty({
    type: FareQuoteLocationResponseDto,
  })
  destination!: FareQuoteLocationResponseDto;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty()
  durationSeconds!: number;

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
  estimatedFare!: string;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: Date;
}
