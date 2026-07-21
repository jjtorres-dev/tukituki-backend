import { Type, Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RejectDriverDocumentDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  documentId!: string;

  @ApiProperty({
    example: 'El documento no es legible',
    minLength: 3,
    maxLength: 500,
  })
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RejectDriverApplicationDto {
  @ApiPropertyOptional({
    example: 'Los datos personales no coinciden con el DNI',
    minLength: 3,
    maxLength: 500,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  profileReason?: string;

  @ApiPropertyOptional({
    example: 'La placa no coincide con la tarjeta de propiedad',
    minLength: 3,
    maxLength: 500,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  vehicleReason?: string;

  @ApiPropertyOptional({
    type: RejectDriverDocumentDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({
    each: true,
  })
  @Type(() => RejectDriverDocumentDto)
  documents?: RejectDriverDocumentDto[];
}
