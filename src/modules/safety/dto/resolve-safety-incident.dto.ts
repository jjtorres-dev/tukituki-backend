import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { SafetyIncidentStatus } from '../enums/safety-incident-status.enum';

export class ResolveSafetyIncidentDto {
  @ApiProperty({
    enum: [SafetyIncidentStatus.RESOLVED, SafetyIncidentStatus.FALSE_ALARM],
  })
  @IsEnum(SafetyIncidentStatus)
  status!: SafetyIncidentStatus.RESOLVED | SafetyIncidentStatus.FALSE_ALARM;

  @ApiProperty({ example: 'Se contactó a los participantes y están seguros.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  resolutionNotes!: string;
}
