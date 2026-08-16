import { randomUUID } from 'node:crypto';

import { StorageCategory } from './enums/storage-category.enum';
import { getExtensionForMimeType } from './storage-category.policy';

const DOCUMENT_CATEGORY_SLUGS: Partial<Record<StorageCategory, string>> = {
  [StorageCategory.DRIVER_LICENSE]: 'driver-license',
  [StorageCategory.SOAT]: 'soat',
  [StorageCategory.VEHICLE_REGISTRATION]: 'vehicle-registration',
};

/*
 * Prefijo server-side para una categoría + owner. El cliente NUNCA
 * elige userId/driverProfileId/path/nombre/extensión: solo recibe el
 * objectKey ya generado.
 */
export function buildOwnerPrefix(
  category: StorageCategory,
  owner: { userId?: string; driverProfileId?: string },
): string {
  switch (category) {
    case StorageCategory.PASSENGER_PROFILE_PHOTO: {
      if (!owner.userId) {
        throw new Error('userId es obligatorio para PASSENGER_PROFILE_PHOTO');
      }

      return `passengers/${owner.userId}/profile`;
    }

    case StorageCategory.DRIVER_PROFILE_PHOTO: {
      if (!owner.driverProfileId) {
        throw new Error(
          'driverProfileId es obligatorio para DRIVER_PROFILE_PHOTO',
        );
      }

      return `drivers/${owner.driverProfileId}/profile`;
    }

    case StorageCategory.DRIVER_LICENSE:
    case StorageCategory.SOAT:
    case StorageCategory.VEHICLE_REGISTRATION: {
      if (!owner.driverProfileId) {
        throw new Error(
          'driverProfileId es obligatorio para documentos de conductor',
        );
      }

      const slug = DOCUMENT_CATEGORY_SLUGS[category];

      return `drivers/${owner.driverProfileId}/documents/${slug}`;
    }
  }
}

export function buildObjectKey(prefix: string, contentType: string): string {
  const extension = getExtensionForMimeType(contentType);

  if (!extension) {
    throw new Error(
      `No hay extensión mapeada para el MIME type ${contentType}`,
    );
  }

  return `${prefix}/${randomUUID()}.${extension}`;
}

/*
 * Un objectKey solo es válido si cae exactamente dentro del prefijo
 * que el propio Backend habría generado para (categoría, owner) y
 * respeta el patrón <uuid>.<extension> como nombre de archivo. El
 * cliente no puede forjar un prefijo ajeno: sin un presigned PUT
 * emitido por este mismo Backend para esa key exacta, Railway
 * rechaza la escritura (las credenciales reales nunca llegan al
 * cliente).
 */
export function isObjectKeyWithinPrefix(
  objectKey: string,
  prefix: string,
): boolean {
  if (!objectKey.startsWith(`${prefix}/`)) {
    return false;
  }

  const fileName = objectKey.slice(prefix.length + 1);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(
    fileName,
  );
}
