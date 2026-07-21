import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IdentityDocumentType } from '../enums/identity-document-type.enum';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeDocumentNumber({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateDriverProfileDto {
  @ApiProperty({
    example: 'Juan José',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({
    example: 'Torres Solano',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({
    enum: IdentityDocumentType,
    example: IdentityDocumentType.DNI,
  })
  @IsEnum(IdentityDocumentType)
  documentType!: IdentityDocumentType;

  @ApiProperty({
    example: '12345678',
    minLength: 8,
    maxLength: 20,
  })
  @Transform(normalizeDocumentNumber)
  @IsString()
  @Matches(/^[A-Z0-9-]{8,20}$/, {
    message:
      'El número de documento debe contener entre 8 y 20 caracteres alfanuméricos',
  })
  documentNumber!: string;

  @ApiProperty({
    example: '1995-06-15',
    description: 'Fecha de nacimiento en formato YYYY-MM-DD',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de nacimiento debe tener el formato YYYY-MM-DD',
  })
  birthDate!: string;

  @ApiProperty({
    example: 'Jr. Los Jardines 245, Tarapoto',
    minLength: 5,
    maxLength: 255,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  address!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.tukituki.pe/drivers/profile.jpg',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  photoUrl?: string;
}
