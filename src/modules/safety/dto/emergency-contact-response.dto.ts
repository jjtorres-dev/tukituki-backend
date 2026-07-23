import { ApiProperty } from '@nestjs/swagger';

import { EmergencyContactRelationship } from '../enums/emergency-contact-relationship.enum';

export class EmergencyContactResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  phoneE164!: string;

  @ApiProperty({ enum: EmergencyContactRelationship })
  relationship!: EmergencyContactRelationship;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
