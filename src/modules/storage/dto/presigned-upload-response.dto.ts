import { ApiProperty } from '@nestjs/swagger';

class RequiredUploadHeadersDto {
  @ApiProperty({
    example: 'image/jpeg',
  })
  'Content-Type'!: string;
}

export class PresignedUploadResponseDto {
  @ApiProperty({
    example:
      'drivers/72b81eb5-c53f-4de2-bd9f-11f33d64da64/documents/driver-license/9c3f9b3e-....jpg',
    description:
      'objectKey generado por el Backend; el cliente debe reenviarlo tal cual en /storage/uploads/complete',
  })
  objectKey!: string;

  @ApiProperty({
    description:
      'URL presignada PUT para subir el archivo directamente al bucket',
  })
  uploadUrl!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: string;

  @ApiProperty({
    type: RequiredUploadHeadersDto,
    description:
      'Headers que el cliente debe enviar exactamente en el PUT presignado',
  })
  requiredHeaders!: RequiredUploadHeadersDto;
}
