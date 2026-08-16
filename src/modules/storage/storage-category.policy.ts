import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { StorageCategory } from './enums/storage-category.enum';

export type StorageObjectKind = 'image' | 'pdf';

const IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const DOCUMENT_MIME_TYPES: readonly string[] = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
];

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/*
 * Mapper EXPLÍCITO entre categoría de Storage y DriverDocumentType.
 * Nunca se aceptan strings arbitrarios: solo estos 3 tipos de
 * documento legacy tienen una categoría de Storage vigente.
 */
const STORAGE_CATEGORY_TO_DRIVER_DOCUMENT_TYPE: Partial<
  Record<StorageCategory, DriverDocumentType>
> = {
  [StorageCategory.DRIVER_LICENSE]: DriverDocumentType.DRIVER_LICENSE,
  [StorageCategory.SOAT]: DriverDocumentType.SOAT,
  [StorageCategory.VEHICLE_REGISTRATION]:
    DriverDocumentType.VEHICLE_REGISTRATION,
};

export function mapStorageCategoryToDriverDocumentType(
  category: StorageCategory,
): DriverDocumentType | null {
  return STORAGE_CATEGORY_TO_DRIVER_DOCUMENT_TYPE[category] ?? null;
}

export function isProfilePhotoCategory(category: StorageCategory): boolean {
  return (
    category === StorageCategory.PASSENGER_PROFILE_PHOTO ||
    category === StorageCategory.DRIVER_PROFILE_PHOTO
  );
}

export function isDriverDocumentCategory(category: StorageCategory): boolean {
  return mapStorageCategoryToDriverDocumentType(category) !== null;
}

export function getAllowedMimeTypes(
  category: StorageCategory,
): readonly string[] {
  return isProfilePhotoCategory(category)
    ? IMAGE_MIME_TYPES
    : DOCUMENT_MIME_TYPES;
}

export function getObjectKind(contentType: string): StorageObjectKind {
  return contentType === 'application/pdf' ? 'pdf' : 'image';
}

export function getExtensionForMimeType(contentType: string): string | null {
  return MIME_EXTENSIONS[contentType] ?? null;
}
