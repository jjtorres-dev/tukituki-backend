import { StorageCategory } from './enums/storage-category.enum';
import {
  buildObjectKey,
  buildOwnerPrefix,
  isObjectKeyWithinPrefix,
} from './storage-object-key.util';

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('storage-object-key.util', () => {
  describe('buildOwnerPrefix', () => {
    it('genera el prefijo de foto de pasajero a partir del userId', () => {
      const prefix = buildOwnerPrefix(StorageCategory.PASSENGER_PROFILE_PHOTO, {
        userId: 'user-1',
      });

      expect(prefix).toBe('passengers/user-1/profile');
    });

    it('genera el prefijo de foto de conductor a partir del driverProfileId', () => {
      const prefix = buildOwnerPrefix(StorageCategory.DRIVER_PROFILE_PHOTO, {
        driverProfileId: 'profile-1',
      });

      expect(prefix).toBe('drivers/profile-1/profile');
    });

    it('genera un prefijo distinto por tipo de documento de conductor', () => {
      expect(
        buildOwnerPrefix(StorageCategory.DRIVER_LICENSE, {
          driverProfileId: 'profile-1',
        }),
      ).toBe('drivers/profile-1/documents/driver-license');

      expect(
        buildOwnerPrefix(StorageCategory.SOAT, {
          driverProfileId: 'profile-1',
        }),
      ).toBe('drivers/profile-1/documents/soat');

      expect(
        buildOwnerPrefix(StorageCategory.VEHICLE_REGISTRATION, {
          driverProfileId: 'profile-1',
        }),
      ).toBe('drivers/profile-1/documents/vehicle-registration');
    });

    it('lanza si falta el owner requerido por la categoría', () => {
      expect(() =>
        buildOwnerPrefix(StorageCategory.PASSENGER_PROFILE_PHOTO, {}),
      ).toThrow();
      expect(() =>
        buildOwnerPrefix(StorageCategory.DRIVER_PROFILE_PHOTO, {}),
      ).toThrow();
      expect(() =>
        buildOwnerPrefix(StorageCategory.DRIVER_LICENSE, {}),
      ).toThrow();
    });
  });

  describe('buildObjectKey', () => {
    it('genera <prefix>/<uuid>.<extension> derivada del MIME type', () => {
      const objectKey = buildObjectKey(
        'drivers/profile-1/profile',
        'image/png',
      );

      expect(objectKey.startsWith('drivers/profile-1/profile/')).toBe(true);
      expect(objectKey.endsWith('.png')).toBe(true);

      const fileName = objectKey.split('/').at(-1)!;

      expect(fileName.replace('.png', '')).toMatch(UUID_PATTERN);
    });

    it('genera un objectKey distinto en cada llamada (UUID aleatorio)', () => {
      const first = buildObjectKey('drivers/profile-1/profile', 'image/jpeg');
      const second = buildObjectKey('drivers/profile-1/profile', 'image/jpeg');

      expect(first).not.toBe(second);
    });

    it('lanza si el MIME type no tiene extensión mapeada', () => {
      expect(() =>
        buildObjectKey('drivers/profile-1/profile', 'image/gif'),
      ).toThrow();
    });
  });

  describe('isObjectKeyWithinPrefix', () => {
    it('acepta un objectKey generado por buildObjectKey para ese mismo prefijo', () => {
      const prefix = 'drivers/profile-1/documents/soat';
      const objectKey = buildObjectKey(prefix, 'application/pdf');

      expect(isObjectKeyWithinPrefix(objectKey, prefix)).toBe(true);
    });

    it('rechaza un objectKey de otro prefijo (otro owner)', () => {
      const objectKey = buildObjectKey(
        'drivers/profile-1/profile',
        'image/png',
      );

      expect(
        isObjectKeyWithinPrefix(objectKey, 'drivers/profile-2/profile'),
      ).toBe(false);
    });

    it('rechaza un objectKey con nombre de archivo que no es <uuid>.<ext>', () => {
      expect(
        isObjectKeyWithinPrefix(
          'drivers/profile-1/profile/nombre-arbitrario.png',
          'drivers/profile-1/profile',
        ),
      ).toBe(false);
    });

    it('rechaza intentos de path traversal fuera del prefijo', () => {
      expect(
        isObjectKeyWithinPrefix(
          'drivers/profile-1/profile/../../profile-2/profile/x.png',
          'drivers/profile-1/profile',
        ),
      ).toBe(false);
    });
  });
});
