import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DriverLocationResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  driverProfileId!: string;

  @ApiProperty({
    example: -6.4877,
  })
  latitude!: number;

  @ApiProperty({
    example: -76.3599,
  })
  longitude!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 90,
  })
  heading!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 7.5,
  })
  speed!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 8,
  })
  accuracy!: number | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  recordedAt!: Date;

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
