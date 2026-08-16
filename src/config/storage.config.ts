import type { ConfigService } from '@nestjs/config';

export interface StorageOptions {
  enabled: boolean;
  bucket: string;
  region: string;
  endpoint: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  uploadUrlTtlSeconds: number;
  downloadUrlTtlSeconds: number;
  maxImageSizeBytes: number;
  maxPdfSizeBytes: number;
}

export function createStorageOptions(
  configService: ConfigService,
): StorageOptions {
  const enabled = configService.get<boolean>('STORAGE_ENABLED', false);

  return {
    enabled,
    bucket: configService.get<string>('STORAGE_BUCKET', ''),
    region: configService.get<string>('STORAGE_REGION', 'auto'),
    endpoint: configService.get<string>('STORAGE_ENDPOINT') || undefined,
    accessKeyId: configService.get<string>('STORAGE_ACCESS_KEY_ID', ''),
    secretAccessKey: configService.get<string>('STORAGE_SECRET_ACCESS_KEY', ''),
    uploadUrlTtlSeconds: configService.getOrThrow<number>(
      'STORAGE_UPLOAD_URL_TTL_SECONDS',
    ),
    downloadUrlTtlSeconds: configService.getOrThrow<number>(
      'STORAGE_DOWNLOAD_URL_TTL_SECONDS',
    ),
    maxImageSizeBytes: configService.getOrThrow<number>(
      'STORAGE_MAX_IMAGE_SIZE_BYTES',
    ),
    maxPdfSizeBytes: configService.getOrThrow<number>(
      'STORAGE_MAX_PDF_SIZE_BYTES',
    ),
  };
}
