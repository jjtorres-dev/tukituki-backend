/*
 * URL estable del propio Backend para un avatar. Al ser solicitada,
 * StorageController redirige (302) a una presigned GET fresca del
 * objeto real en el bucket — nunca se persiste una presigned URL
 * como dato canónico (caducan).
 *
 * Es una función pura (sin dependencias de NestJS) para que
 * DriversService/PassengersService puedan reutilizarla sin depender
 * del módulo Storage.
 */
export function buildDriverAvatarUrl(
  publicApiOrigin: string,
  apiPrefix: string,
  driverProfileId: string,
): string {
  return `${trimTrailingSlash(publicApiOrigin)}/${trimSlashes(apiPrefix)}/storage/avatars/driver/${driverProfileId}`;
}

export function buildPassengerAvatarUrl(
  publicApiOrigin: string,
  apiPrefix: string,
  passengerProfileId: string,
): string {
  return `${trimTrailingSlash(publicApiOrigin)}/${trimSlashes(apiPrefix)}/storage/avatars/passenger/${passengerProfileId}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}
