import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePassengerProfileDto {
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

  @ApiPropertyOptional({
    example: 'https://cdn.tukituki.pe/passengers/profile.jpg',
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

  @ApiPropertyOptional({
    example: 'María Torres',
    maxLength: 120,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  emergencyContactName?: string;

  @ApiPropertyOptional({
    example: '+51912345678',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+519\d{8}$/, {
    message: 'El teléfono de emergencia debe tener el formato +519XXXXXXXX',
  })
  emergencyContactPhoneE164?: string;
}
