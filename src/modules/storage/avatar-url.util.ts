import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * STORAGE-R2.1: acceso a avatares por capability token firmado, NO por
 * profileId público (ver docs/contexto/Backend/decisiones.md).
 *
 * El token nunca se persiste: se minta en el momento de construir una
 * respuesta ya autorizada (ride propio, historial propio, share-link
 * válido, admin) y se verifica al vuelo cuando se resuelve el avatar.
 * Un profileId conocido/adivinado, sin un token válido, no alcanza
 * para obtener la foto.
 */
export type AvatarKind = 'driver' | 'passenger';

export interface AvatarUrlContext {
  publicApiOrigin: string;
  apiPrefix: string;
  tokenSecret: string;
  tokenTtlSeconds: number;
}

export function mintAvatarToken(
  kind: AvatarKind,
  profileId: string,
  secret: string,
  ttlSeconds: number,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signAvatarPayload(kind, profileId, expiresAt, secret);

  return `${expiresAt}.${signature}`;
}

export function verifyAvatarToken(
  kind: AvatarKind,
  profileId: string,
  token: string,
  secret: string,
): boolean {
  const separatorIndex = token.indexOf('.');

  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return false;
  }

  const expiresAtRaw = token.slice(0, separatorIndex);
  const receivedSignature = token.slice(separatorIndex + 1);
  const expiresAt = Number(expiresAtRaw);

  if (!Number.isInteger(expiresAt)) {
    return false;
  }

  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = signAvatarPayload(
    kind,
    profileId,
    expiresAt,
    secret,
  );
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(receivedSignature, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/*
 * Resuelve el valor de "photoUrl" a exponer en una respuesta ya
 * autorizada:
 *
 * - si existe photoObjectKey (Storage), minta un token fresco y
 *   devuelve la URL estable del Backend con ese token;
 * - si no, conserva el photoUrl legacy tal cual (compatibilidad);
 * - si no hay ninguno, null.
 */
export function resolveAvatarUrl(
  ctx: AvatarUrlContext,
  kind: AvatarKind,
  profileId: string,
  photoObjectKey: string | null,
  legacyPhotoUrl: string | null,
): string | null {
  if (photoObjectKey) {
    const token = mintAvatarToken(
      kind,
      profileId,
      ctx.tokenSecret,
      ctx.tokenTtlSeconds,
    );
    const base =
      kind === 'driver'
        ? buildDriverAvatarPath(ctx.publicApiOrigin, ctx.apiPrefix, profileId)
        : buildPassengerAvatarPath(
            ctx.publicApiOrigin,
            ctx.apiPrefix,
            profileId,
          );

    return `${base}?token=${encodeURIComponent(token)}`;
  }

  return legacyPhotoUrl;
}

function signAvatarPayload(
  kind: AvatarKind,
  profileId: string,
  expiresAt: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${kind}:${profileId}:${expiresAt}`)
    .digest('base64url');
}

function buildDriverAvatarPath(
  publicApiOrigin: string,
  apiPrefix: string,
  driverProfileId: string,
): string {
  return `${trimTrailingSlash(publicApiOrigin)}/${trimSlashes(apiPrefix)}/storage/avatars/driver/${driverProfileId}`;
}

function buildPassengerAvatarPath(
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
