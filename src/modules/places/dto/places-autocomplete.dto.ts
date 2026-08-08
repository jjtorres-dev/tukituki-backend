import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PlacesAutocompleteDto {
  @ApiProperty({
    example: 'GH Bus',
    minLength: 2,
    maxLength: 120,
  })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  input!: string;

  @ApiProperty({
    example: -6.47205,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
  })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    example: -76.39432,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
  })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    description: 'Token único de la sesión de autocompletado',
    example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,36}$/)
  sessionToken?: string;
}

export class PlaceAutocompleteItemDto {
  @ApiProperty()
  placeId!: string;

  @ApiProperty({
    example: 'GH Bus',
  })
  primaryText!: string;

  @ApiProperty({
    example: 'Terminal de Buses Morales, Tarapoto',
  })
  secondaryText!: string;

  @ApiProperty({
    example: 'GH Bus, Terminal de Buses Morales, Tarapoto',
  })
  fullText!: string;

  @ApiPropertyOptional({
    example: 850,
    nullable: true,
  })
  distanceMeters!: number | null;
}

export class PlacesAutocompleteResponseDto {
  @ApiProperty({
    type: [PlaceAutocompleteItemDto],
  })
  items!: PlaceAutocompleteItemDto[];
}
