import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateCommissionPolicyDto {
  @ApiProperty({
    example: '5.00',
    description: 'Porcentaje entre 3.00 y 5.00.',
  })
  @IsString()
  @Matches(/^(?:3(?:\.\d{1,2})?|4(?:\.\d{1,2})?|5(?:\.0{1,2})?)$/)
  ratePercent!: string;

  @ApiProperty({
    example: 'Tarifa base para cubrir operación y costos de plataforma',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
