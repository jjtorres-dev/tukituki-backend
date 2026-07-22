import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ServiceZoneStatus } from '../enums/service-zone-status.enum';
import { ServiceZoneBoundaryDto } from './service-zone-boundary.dto';

export class ServiceZoneSummaryDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;
}

export class ServiceZoneResponseDto extends ServiceZoneSummaryDto {
  @ApiPropertyOptional({
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    type: ServiceZoneBoundaryDto,
  })
  boundary!: ServiceZoneBoundaryDto;

  @ApiProperty({
    enum: ServiceZoneStatus,
  })
  status!: ServiceZoneStatus;

  @ApiProperty()
  priority!: number;

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

export class ServiceZoneListResponseDto {
  @ApiProperty({
    type: ServiceZoneResponseDto,
    isArray: true,
  })
  items!: ServiceZoneResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class CheckServiceZonePointResponseDto {
  @ApiProperty()
  covered!: boolean;

  @ApiPropertyOptional({
    type: ServiceZoneSummaryDto,
    nullable: true,
  })
  zone!: ServiceZoneSummaryDto | null;
}
