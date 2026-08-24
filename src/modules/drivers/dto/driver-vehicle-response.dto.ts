import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VehicleOwnership } from '../enums/vehicle-ownership.enum';
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

  @ApiPropertyOptional({
    example: 'ENG123456789',
    nullable: true,
  })
  engineNumber!: string | null;

  @ApiPropertyOptional({
    example: 'CHS123456789',
    nullable: true,
  })
  chassisNumber!: string | null;

  @ApiPropertyOptional({
    enum: VehicleOwnership,
    nullable: true,
  })
  ownership!: VehicleOwnership | null;

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
