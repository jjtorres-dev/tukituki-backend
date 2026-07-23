import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteRideDto {
  @ApiPropertyOptional({
    example: 'Pasajero dejado en la entrada principal',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  completionNotes?: string;
}
