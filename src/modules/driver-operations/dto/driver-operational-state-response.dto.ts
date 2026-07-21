import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverOperationalStatus } from '../enums/driver-operational-status.enum';

export class DriverOperationalStateResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  driverProfileId!: string;

  @ApiProperty({
    enum: DriverOperationalStatus,
  })
  status!: DriverOperationalStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  connectedAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  disconnectedAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastSeenAt!: Date | null;

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
