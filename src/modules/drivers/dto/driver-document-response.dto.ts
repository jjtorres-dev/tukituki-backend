import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverDocumentStatus } from '../enums/driver-document-status.enum';
import { DriverDocumentType } from '../enums/driver-document-type.enum';

export class DriverDocumentResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  driverProfileId!: string;

  @ApiProperty({
    enum: DriverDocumentType,
  })
  type!: DriverDocumentType;

  @ApiPropertyOptional({
    example: 'https://cdn.tukituki.pe/documents/license.jpg',
    nullable: true,
    description:
      'Legacy: URL enviada por el cliente. Nullable desde STORAGE-R2.',
  })
  fileUrl!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'objectKey canónico en Railway Storage Buckets, si el documento fue subido mediante STORAGE-R2.',
  })
  fileObjectKey!: string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  documentNumber!: string | null;

  @ApiPropertyOptional({
    example: '2024-05-10',
    nullable: true,
  })
  issuedAt!: string | null;

  @ApiPropertyOptional({
    example: '2029-05-10',
    nullable: true,
  })
  expiresAt!: string | null;

  @ApiProperty({
    enum: DriverDocumentStatus,
  })
  status!: DriverDocumentStatus;

  @ApiPropertyOptional({
    nullable: true,
  })
  rejectionReason!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  reviewedAt!: Date | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
  })
  reviewedByUserId!: string | null;

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
