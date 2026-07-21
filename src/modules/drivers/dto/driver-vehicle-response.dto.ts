import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VehicleStatus } from '../enums/vehicle-status.enum';
import { VehicleType } from '../enums/vehicle-type.enum';

export class DriverVehicleResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  driverProfileId!: string;

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

  @ApiProperty({
    example: 2024,
  })
  year!: number;

  @ApiProperty({
    example: 'Azul',
  })
  color!: string;

  @ApiProperty({
    example: 'ENG123456789',
  })
  engineNumber!: string;

  @ApiProperty({
    example: 'CHS123456789',
  })
  chassisNumber!: string;

  @ApiProperty({
    enum: VehicleType,
  })
  vehicleType!: VehicleType;

  @ApiProperty({
    enum: VehicleStatus,
  })
  status!: VehicleStatus;

  @ApiPropertyOptional({
    nullable: true,
  })
  rejectionReason!: string | null;

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
