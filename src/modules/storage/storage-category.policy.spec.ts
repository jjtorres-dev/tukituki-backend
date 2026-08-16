import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { StorageCategory } from './enums/storage-category.enum';
import {
  getAllowedMimeTypes,
  getExtensionForMimeType,
  getObjectKind,
  isDriverDocumentCategory,
  isProfilePhotoCategory,
  mapStorageCategoryToDriverDocumentType,
} from './storage-category.policy';

describe('storage-category.policy', () => {
  describe('mapStorageCategoryToDriverDocumentType', () => {
    it('mapea las 3 categorías de documento aprobadas a su DriverDocumentType', () => {
      expect(
        mapStorageCategoryToDriverDocumentType(StorageCategory.DRIVER_LICENSE),
      ).toBe(DriverDocumentType.DRIVER_LICENSE);
      expect(mapStorageCategoryToDriverDocumentType(StorageCategory.SOAT)).toBe(
        DriverDocumentType.SOAT,
      );
      expect(
        mapStorageCategoryToDriverDocumentType(
          StorageCategory.VEHICLE_REGISTRATION,
        ),
      ).toBe(DriverDocumentType.VEHICLE_REGISTRATION);
    });

    it('devuelve null para categorías de foto de perfil', () => {
      expect(
        mapStorageCategoryToDriverDocumentType(
          StorageCategory.DRIVER_PROFILE_PHOTO,
        ),
      ).toBeNull();
      expect(
        mapStorageCategoryToDriverDocumentType(
          StorageCategory.PASSENGER_PROFILE_PHOTO,
        ),
      ).toBeNull();
    });
  });

  describe('isProfilePhotoCategory / isDriverDocumentCategory', () => {
    it('clasifica correctamente cada categoría', () => {
      expect(isProfilePhotoCategory(StorageCategory.DRIVER_PROFILE_PHOTO)).toBe(
        true,
      );
      expect(
        isProfilePhotoCategory(StorageCategory.PASSENGER_PROFILE_PHOTO),
      ).toBe(true);
      expect(isProfilePhotoCategory(StorageCategory.DRIVER_LICENSE)).toBe(
        false,
      );

      expect(isDriverDocumentCategory(StorageCategory.SOAT)).toBe(true);
      expect(
        isDriverDocumentCategory(StorageCategory.DRIVER_PROFILE_PHOTO),
      ).toBe(false);
    });
  });

  describe('getAllowedMimeTypes', () => {
    it('las fotos de perfil no permiten PDF', () => {
      const mimeTypes = getAllowedMimeTypes(
        StorageCategory.DRIVER_PROFILE_PHOTO,
      );

      expect(mimeTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
      expect(mimeTypes).not.toContain('application/pdf');
    });

    it('los documentos de conductor permiten imagen o PDF', () => {
      const mimeTypes = getAllowedMimeTypes(StorageCategory.DRIVER_LICENSE);

      expect(mimeTypes).toEqual(
        expect.arrayContaining([
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ]),
      );
    });
  });

  describe('getObjectKind / getExtensionForMimeType', () => {
    it('reconoce application/pdf como pdf y el resto como image', () => {
      expect(getObjectKind('application/pdf')).toBe('pdf');
      expect(getObjectKind('image/jpeg')).toBe('image');
      expect(getObjectKind('image/png')).toBe('image');
    });

    it('mapea cada MIME permitido a su extensión', () => {
      expect(getExtensionForMimeType('image/jpeg')).toBe('jpg');
      expect(getExtensionForMimeType('image/png')).toBe('png');
      expect(getExtensionForMimeType('image/webp')).toBe('webp');
      expect(getExtensionForMimeType('application/pdf')).toBe('pdf');
    });

    it('devuelve null para un MIME type no soportado', () => {
      expect(getExtensionForMimeType('image/gif')).toBeNull();
    });
  });
});
