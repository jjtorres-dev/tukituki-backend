import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PlaceDetailsQueryDto {
  @ApiPropertyOptional({
    description: 'Mismo token utilizado durante Autocomplete',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,36}$/)
  sessionToken?: string;
}

export class PlaceDetailsResponseDto {
  @ApiProperty()
  placeId!: string;

  @ApiProperty({
    example: 'Terminal de Buses Morales, Tarapoto 22201',
  })
  formattedAddress!: string;

  @ApiProperty({
    example: -6.47543,
  })
  latitude!: number;

  @ApiProperty({
    example: -76.39464,
  })
  longitude!: number;
}
