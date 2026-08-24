import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const sendMock = jest.fn();
const getSignedUrl = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const actual: object = jest.requireActual('@aws-sdk/client-s3');

  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]): unknown => getSignedUrl(...args),
}));

import { S3StorageService } from './s3-storage.service';

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

const ENABLED_CONFIG = {
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
};

describe('S3StorageService', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrl.mockReset();
  });

  describe('deshabilitado (STORAGE_ENABLED=false)', () => {
    it('isEnabled() es false y las operaciones que requieren el cliente lanzan ServiceUnavailableException', async () => {
      const service = new S3StorageService(
        buildConfigService({ ...ENABLED_CONFIG, STORAGE_ENABLED: false }),
      );

      expect(service.isEnabled()).toBe(false);
      await expect(
        service.presignPutUrl('drivers/x/profile/1.jpg', 'image/jpeg'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        service.presignGetUrl('drivers/x/profile/1.jpg'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        service.headObject('drivers/x/profile/1.jpg'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('deleteObjectBestEffort no hace nada y no lanza cuando está deshabilitado', async () => {
      const service = new S3StorageService(
        buildConfigService({ ...ENABLED_CONFIG, STORAGE_ENABLED: false }),
      );

      await expect(
        service.deleteObjectBestEffort('drivers/x/profile/1.jpg'),
      ).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('habilitado (STORAGE_ENABLED=true)', () => {
    it('presignPutUrl genera una URL usando el TTL de subida configurado', async () => {
      getSignedUrl.mockResolvedValue('https://signed.example/put');

      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));
      const url = await service.presignPutUrl(
        'drivers/x/profile/1.jpg',
        'image/jpeg',
      );

      expect(url).toBe('https://signed.example/put');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });

    it('presignGetUrl genera una URL usando el TTL de descarga configurado', async () => {
      getSignedUrl.mockResolvedValue('https://signed.example/get');

      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));
      const url = await service.presignGetUrl('drivers/x/profile/1.jpg');

      expect(url).toBe('https://signed.example/get');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 900 },
      );
    });

    it('headObject devuelve contentType/contentLength cuando el objeto existe', async () => {
      sendMock.mockResolvedValue({
        ContentType: 'image/jpeg',
        ContentLength: 12345,
      });

      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));
      const head = await service.headObject('drivers/x/profile/1.jpg');

      expect(head).toEqual({ contentType: 'image/jpeg', contentLength: 12345 });
    });

    it('headObject devuelve null cuando el objeto no existe (404/NotFound)', async () => {
      sendMock.mockRejectedValue(
        Object.assign(new Error('not found'), { name: 'NotFound' }),
      );

      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));
      const head = await service.headObject('drivers/x/profile/missing.jpg');

      expect(head).toBeNull();
    });

    it('headObject re-lanza errores que no son "no encontrado"', async () => {
      sendMock.mockRejectedValue(new Error('network unreachable'));

      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));

      await expect(
        service.headObject('drivers/x/profile/1.jpg'),
      ).rejects.toThrow('network unreachable');
    });

    it('deleteObjectBestEffort no lanza si el borrado falla (best-effort)', async () => {
      sendMock.mockRejectedValue(new Error('bucket unreachable'));

      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));

      await expect(
        service.deleteObjectBestEffort('drivers/x/profile/old.jpg'),
      ).resolves.toBeUndefined();
    });

    it('expone los límites de tamaño configurados', () => {
      const service = new S3StorageService(buildConfigService(ENABLED_CONFIG));

      expect(service.getMaxImageSizeBytes()).toBe(8_388_608);
      expect(service.getMaxPdfSizeBytes()).toBe(10_485_760);
    });
  });
});
