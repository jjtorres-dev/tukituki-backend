import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({
    description:
      'URL para leer el documento. Presignada y temporal cuando isLegacyUrl es false; URL legacy directa (sin expiración conocida) cuando isLegacyUrl es true.',
  })
  downloadUrl!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Nulo cuando isLegacyUrl es true (una URL legacy no tiene expiración administrada por este Backend).',
  })
  expiresAt!: string | null;

  @ApiProperty({
    description:
      'true si el documento todavía no fue migrado a Storage y esta URL es el fileUrl legacy tal cual.',
  })
  isLegacyUrl!: boolean;
}
