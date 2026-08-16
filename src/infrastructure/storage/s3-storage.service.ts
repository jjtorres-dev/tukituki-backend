import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createStorageOptions } from '../../config/storage.config';
import type { StorageOptions } from '../../config/storage.config';

export interface StorageObjectHead {
  contentType: string | null;
  contentLength: number | null;
}

/*
 * Cliente S3 puro: solo conoce bucket/objectKey/contentType/size.
 * No conoce Passenger, Driver, DriverDocument ni Ride. La
 * orquestación de negocio vive en modules/storage.
 */
@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);

  private readonly options: StorageOptions;

  private readonly client: S3Client | null;

  constructor(configService: ConfigService) {
    this.options = createStorageOptions(configService);

    this.client = this.options.enabled
      ? new S3Client({
          region: this.options.region,
          endpoint: this.options.endpoint,
          /*
           * Railway Storage Buckets (y la mayoría de proveedores
           * S3-compatibles fuera de AWS) requieren estilo de path
           * en vez de virtual-hosted-style.
           */
          forcePathStyle: true,
          credentials: {
            accessKeyId: this.options.accessKeyId,
            secretAccessKey: this.options.secretAccessKey,
          },
        })
      : null;
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  getUploadUrlTtlSeconds(): number {
    return this.options.uploadUrlTtlSeconds;
  }

  getDownloadUrlTtlSeconds(): number {
    return this.options.downloadUrlTtlSeconds;
  }

  getMaxImageSizeBytes(): number {
    return this.options.maxImageSizeBytes;
  }

  getMaxPdfSizeBytes(): number {
    return this.options.maxPdfSizeBytes;
  }

  async presignPutUrl(objectKey: string, contentType: string): Promise<string> {
    const client = this.assertEnabled();

    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    return getSignedUrl(client, command, {
      expiresIn: this.options.uploadUrlTtlSeconds,
    });
  }

  async presignGetUrl(objectKey: string): Promise<string> {
    const client = this.assertEnabled();

    const command = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: objectKey,
    });

    return getSignedUrl(client, command, {
      expiresIn: this.options.downloadUrlTtlSeconds,
    });
  }

  /*
   * Devuelve null si el objeto no existe en el bucket (404), en vez
   * de lanzar, para que el llamador decida el error de dominio
   * apropiado (BadRequest/NotFound según el contexto).
   */
  async headObject(objectKey: string): Promise<StorageObjectHead | null> {
    const client = this.assertEnabled();

    try {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentType: result.ContentType ?? null,
        contentLength: result.ContentLength ?? null,
      };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  /*
   * Best-effort: un fallo al borrar el objeto anterior nunca debe
   * revertir una referencia nueva ya persistida en DB (ver Fase 20 /
   * Fase 24 del checkpoint STORAGE-R2).
   */
  async deleteObjectBestEffort(objectKey: string): Promise<void> {
    if (!this.options.enabled || !this.client) {
      return;
    }

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey,
        }),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo eliminar el objeto huérfano ${objectKey} del bucket: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private assertEnabled(): S3Client {
    if (!this.options.enabled || !this.client) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos todavía no está habilitado en este ambiente',
      );
    }

    return this.client;
  }

  private isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const withName = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };

    return (
      withName.name === 'NotFound' ||
      withName.name === 'NoSuchKey' ||
      withName.$metadata?.httpStatusCode === 404
    );
  }
}
