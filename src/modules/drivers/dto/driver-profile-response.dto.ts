import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverStatus } from '../enums/driver-status.enum';
import { IdentityDocumentType } from '../enums/identity-document-type.enum';

export class DriverProfileResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  userId!: string;

  @ApiProperty({
    example: 'Juan José',
  })
  firstName!: string;

  @ApiProperty({
    example: 'Torres Solano',
  })
  lastName!: string;

  @ApiProperty({
    enum: IdentityDocumentType,
  })
  documentType!: IdentityDocumentType;

  @ApiProperty({
    example: '12345678',
  })
  documentNumber!: string;

  @ApiProperty({
    example: '1995-06-15',
  })
  birthDate!: string;

  @ApiProperty()
  address!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  photoUrl!: string | null;

  @ApiProperty({ example: '4.85' })
  ratingAverage!: string;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty({
    enum: DriverStatus,
  })
  status!: DriverStatus;

  @ApiPropertyOptional({
    nullable: true,
  })
  rejectionReason!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  submittedAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  approvedAt!: Date | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
  })
  approvedByUserId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 500,
  })
  suspensionReason!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  suspendedAt!: Date | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
  })
  suspendedByUserId!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;
}
