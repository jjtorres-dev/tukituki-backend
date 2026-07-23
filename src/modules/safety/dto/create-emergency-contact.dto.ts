import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EmergencyContactRelationship } from '../enums/emergency-contact-relationship.enum';

export class CreateEmergencyContactDto {
  @ApiProperty({ example: 'María Torres' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '+51987654321' })
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @ApiProperty({ enum: EmergencyContactRelationship })
  @IsEnum(EmergencyContactRelationship)
  relationship!: EmergencyContactRelationship;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
