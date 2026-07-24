import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDriverSettlementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  driverProfileId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
