import { ApiProperty } from '@nestjs/swagger';

import { ServiceZoneSummaryDto } from '../../service-zones/dto/service-zone-response.dto';

export class FareEstimateResponseDto {
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
}
