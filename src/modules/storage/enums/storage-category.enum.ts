/*
 * Categorías vigentes de STORAGE-R2, aprobadas explícitamente por
 * decisión de producto (ver docs/contexto/estado-proyecto.md).
 *
 * Deliberadamente NO incluye DNI_FRONT, DNI_BACK ni PROFILE_PHOTO:
 * esos valores siguen existiendo en DriverDocumentType (legacy) pero
 * no son categorías nuevas de la infraestructura de Storage.
 */
export enum StorageCategory {
  PASSENGER_PROFILE_PHOTO = 'PASSENGER_PROFILE_PHOTO',
  DRIVER_PROFILE_PHOTO = 'DRIVER_PROFILE_PHOTO',
  DRIVER_LICENSE = 'DRIVER_LICENSE',
  SOAT = 'SOAT',
  VEHICLE_REGISTRATION = 'VEHICLE_REGISTRATION',
}
