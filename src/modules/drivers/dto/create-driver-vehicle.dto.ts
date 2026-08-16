import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { VehicleOwnership } from '../enums/vehicle-ownership.enum';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeIdentifier({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

const maximumVehicleYear = new Date().getFullYear() + 1;

export class CreateDriverVehicleDto {
  @ApiProperty({
    example: '1234-AB',
    minLength: 5,
    maxLength: 15,
  })
  @Transform(normalizeIdentifier)
  @IsString()
  @Matches(/^[A-Z0-9-]{5,15}$/, {
    message: 'La placa debe contener entre 5 y 15 caracteres alfanuméricos',
  })
  plate!: string;

  @ApiProperty({
    example: 'Bajaj',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  brand!: string;

  @ApiProperty({
    example: 'RE 4S',
    minLength: 1,
    maxLength: 80,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  model!: string;

  @ApiProperty({
    example: 2024,
    minimum: 1980,
    maximum: maximumVehicleYear,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(maximumVehicleYear)
  year!: number;

  @ApiProperty({
    example: 'Azul',
    minLength: 2,
    maxLength: 50,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  color!: string;

  @ApiProperty({
    required: false,
    example: 'ENG123456789',
    minLength: 5,
    maxLength: 80,
    description:
      'Opcional (DRIVER-ONBOARDING-R2): el onboarding nuevo ya no lo pide.',
  })
  @IsOptional()
  @Transform(normalizeIdentifier)
  @IsString()
  @Matches(/^[A-Z0-9-]{5,80}$/, {
    message:
      'El número de motor debe contener entre 5 y 80 caracteres alfanuméricos',
  })
  engineNumber?: string;

  @ApiProperty({
    required: false,
    example: 'CHS123456789',
    minLength: 5,
    maxLength: 80,
    description:
      'Opcional (DRIVER-ONBOARDING-R2): el onboarding nuevo ya no lo pide.',
  })
  @IsOptional()
  @Transform(normalizeIdentifier)
  @IsString()
  @Matches(/^[A-Z0-9-]{5,80}$/, {
    message:
      'El número de chasis debe contener entre 5 y 80 caracteres alfanuméricos',
  })
  chassisNumber?: string;

  @ApiProperty({
    enum: VehicleOwnership,
    example: VehicleOwnership.OWNED,
  })
  @IsEnum(VehicleOwnership)
  ownership!: VehicleOwnership;
}
