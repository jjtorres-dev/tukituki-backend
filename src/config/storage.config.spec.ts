import type { ConfigService } from '@nestjs/config';

import { createStorageOptions } from './storage.config';

function buildConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T): T =>
      key in values ? (values[key] as T) : (defaultValue as T),
    getOrThrow: <T>(key: string): T => {
      if (!(key in values)) {
        throw new Error(`Missing config key: ${key}`);
      }

      return values[key] as T;
    },
  } as unknown as ConfigService;
}

describe('createStorageOptions', () => {
  it('con STORAGE_ENABLED=false no exige credenciales reales', () => {
    const configService = buildConfigService({
      STORAGE_ENABLED: false,
      STORAGE_UPLOAD_URL_TTL_SECONDS: 300,
      STORAGE_DOWNLOAD_URL_TTL_SECONDS: 900,
      STORAGE_MAX_IMAGE_SIZE_BYTES: 8_388_608,
      STORAGE_MAX_PDF_SIZE_BYTES: 10_485_760,
    });

    const options = createStorageOptions(configService);

    expect(options.enabled).toBe(false);
    expect(options.bucket).toBe('');
    expect(options.accessKeyId).toBe('');
    expect(options.secretAccessKey).toBe('');
  });

  it('con STORAGE_ENABLED=true refleja bucket/credenciales/región/endpoint provistos', () => {
    const configService = buildConfigService({
      STORAGE_ENABLED: true,
      STORAGE_BUCKET: 'tukituki-media',
      STORAGE_ACCESS_KEY_ID: 'access-key',
      STORAGE_SECRET_ACCESS_KEY: 'secret-key',
      STORAGE_REGION: 'auto',
      STORAGE_ENDPOINT: 'https://bucket.example.railway.app',
      STORAGE_UPLOAD_URL_TTL_SECONDS: 300,
      STORAGE_DOWNLOAD_URL_TTL_SECONDS: 900,
      STORAGE_MAX_IMAGE_SIZE_BYTES: 8_388_608,
      STORAGE_MAX_PDF_SIZE_BYTES: 10_485_760,
    });

    const options = createStorageOptions(configService);

    expect(options.enabled).toBe(true);
    expect(options.bucket).toBe('tukituki-media');
    expect(options.accessKeyId).toBe('access-key');
    expect(options.secretAccessKey).toBe('secret-key');
    expect(options.region).toBe('auto');
    expect(options.endpoint).toBe('https://bucket.example.railway.app');
  });

  it('expone los límites de tamaño y TTL configurados', () => {
    const configService = buildConfigService({
      STORAGE_ENABLED: false,
      STORAGE_UPLOAD_URL_TTL_SECONDS: 120,
      STORAGE_DOWNLOAD_URL_TTL_SECONDS: 600,
      STORAGE_MAX_IMAGE_SIZE_BYTES: 1_000_000,
      STORAGE_MAX_PDF_SIZE_BYTES: 2_000_000,
    });

    const options = createStorageOptions(configService);

    expect(options.uploadUrlTtlSeconds).toBe(120);
    expect(options.downloadUrlTtlSeconds).toBe(600);
    expect(options.maxImageSizeBytes).toBe(1_000_000);
    expect(options.maxPdfSizeBytes).toBe(2_000_000);
  });
});
