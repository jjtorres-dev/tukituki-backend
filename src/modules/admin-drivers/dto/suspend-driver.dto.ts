import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SuspendDriverDto {
  @ApiProperty({
    example: 'Incumplimiento de las políticas de seguridad',
    minLength: 5,
    maxLength: 500,
  })
  @Transform(trimString)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
