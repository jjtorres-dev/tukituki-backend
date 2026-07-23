import { Transform, Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FareEstimateLocationDto {
  @ApiProperty({
    example: -6.4877,
  })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({
    example: -76.3599,
  })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiProperty({
    example: 'Jr. Lima 250, Tarapoto',
    minLength: 5,
    maxLength: 300,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address!: string;
}
