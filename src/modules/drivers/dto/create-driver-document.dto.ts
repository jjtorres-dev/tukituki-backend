import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverDocumentType } from '../enums/driver-document-type.enum';

function normalizeDocumentNumber({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateDriverDocumentDto {
  @ApiProperty({
    enum: DriverDocumentType,
    example: DriverDocumentType.DRIVER_LICENSE,
  })
  @IsEnum(DriverDocumentType)
  type!: DriverDocumentType;

  @ApiProperty({
    example: 'https://cdn.tukituki.pe/documents/license.jpg',
    maxLength: 2048,
  })
  @IsString()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  fileUrl!: string;

  @ApiPropertyOptional({
    example: 'Q12345678',
    maxLength: 50,
  })
  @Transform(normalizeDocumentNumber)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9./-]{3,50}$/, {
    message: 'El número del documento tiene un formato inválido',
  })
  documentNumber?: string;

  @ApiPropertyOptional({
    example: '2024-05-10',
    description: 'Fecha de emisión en formato YYYY-MM-DD',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de emisión debe tener el formato YYYY-MM-DD',
  })
  issuedAt?: string;

  @ApiPropertyOptional({
    example: '2029-05-10',
    description: 'Fecha de vencimiento en formato YYYY-MM-DD',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de vencimiento debe tener el formato YYYY-MM-DD',
  })
  expiresAt?: string;
}
