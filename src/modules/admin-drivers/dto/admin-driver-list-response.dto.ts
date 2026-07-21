import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverStatus } from '../../drivers/enums/driver-status.enum';

export class AdminDriverVehicleSummaryDto {
  @ApiProperty({
    example: '1234-AB',
  })
  plate!: string;

  @ApiProperty({
    example: 'Bajaj',
  })
  brand!: string;

  @ApiProperty({
    example: 'RE 4S',
  })
  model!: string;
}

export class AdminDriverListItemDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  userId!: string;

  @ApiProperty({
    example: '+51987654321',
  })
  phoneE164!: string;

  @ApiProperty({
    example: 'Juan José',
  })
  firstName!: string;

  @ApiProperty({
    example: 'Torres Solano',
  })
  lastName!: string;

  @ApiProperty({
    example: '12345678',
  })
  documentNumber!: string;

  @ApiProperty({
    enum: DriverStatus,
  })
  status!: DriverStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  submittedAt!: Date | null;

  @ApiPropertyOptional({
    type: AdminDriverVehicleSummaryDto,
    nullable: true,
  })
  vehicle!: AdminDriverVehicleSummaryDto | null;
}

export class AdminDriverListResponseDto {
  @ApiProperty({
    type: AdminDriverListItemDto,
    isArray: true,
  })
  items!: AdminDriverListItemDto[];

  @ApiProperty({
    example: 1,
  })
  page!: number;

  @ApiProperty({
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    example: 45,
  })
  total!: number;

  @ApiProperty({
    example: 3,
  })
  totalPages!: number;
}
