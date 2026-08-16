import {
  mintAvatarToken,
  resolveAvatarUrl,
  verifyAvatarToken,
} from './avatar-url.util';
import type { AvatarUrlContext } from './avatar-url.util';

const SECRET = 'a-test-secret-of-at-least-32-characters!!';

const CONTEXT: AvatarUrlContext = {
  publicApiOrigin: 'https://api.tukituki.pe',
  apiPrefix: 'api/v1',
  tokenSecret: SECRET,
  tokenTtlSeconds: 900,
};

describe('avatar-url.util', () => {
  describe('mintAvatarToken / verifyAvatarToken', () => {
    it('un token recién emitido es válido para el mismo kind/profileId', () => {
      const token = mintAvatarToken('driver', 'profile-1', SECRET, 900);

      expect(verifyAvatarToken('driver', 'profile-1', token, SECRET)).toBe(
        true,
      );
    });

    it('rechaza un token emitido para otro profileId (no es transferible)', () => {
      const token = mintAvatarToken('driver', 'profile-1', SECRET, 900);

      expect(verifyAvatarToken('driver', 'profile-2', token, SECRET)).toBe(
        false,
      );
    });

    it('rechaza un token emitido para otro kind (driver vs passenger)', () => {
      const token = mintAvatarToken('driver', 'profile-1', SECRET, 900);

      expect(verifyAvatarToken('passenger', 'profile-1', token, SECRET)).toBe(
        false,
      );
    });

    it('rechaza un token firmado con otro secreto', () => {
      const token = mintAvatarToken('driver', 'profile-1', SECRET, 900);

      expect(
        verifyAvatarToken(
          'driver',
          'profile-1',
          token,
          'otro-secreto-de-32-caracteres!!',
        ),
      ).toBe(false);
    });

    it('rechaza un token vencido', () => {
      const token = mintAvatarToken('driver', 'profile-1', SECRET, -1);

      expect(verifyAvatarToken('driver', 'profile-1', token, SECRET)).toBe(
        false,
      );
    });

    it('rechaza un token manipulado (firma alterada)', () => {
      const token = mintAvatarToken('driver', 'profile-1', SECRET, 900);
      const tampered = `${token}x`;

      expect(verifyAvatarToken('driver', 'profile-1', tampered, SECRET)).toBe(
        false,
      );
    });

    it('rechaza strings sin el separador esperado', () => {
      expect(
        verifyAvatarToken('driver', 'profile-1', 'sin-separador', SECRET),
      ).toBe(false);
      expect(verifyAvatarToken('driver', 'profile-1', '', SECRET)).toBe(false);
    });

    it('un profileId conocido/adivinado sin token válido no verifica', () => {
      expect(
        verifyAvatarToken('driver', 'profile-1', 'cualquier-cosa', SECRET),
      ).toBe(false);
    });
  });

  describe('resolveAvatarUrl', () => {
    it('con photoObjectKey, devuelve la URL estable del Backend con un token válido', () => {
      const url = resolveAvatarUrl(
        CONTEXT,
        'driver',
        'profile-1',
        'drivers/profile-1/profile/1.jpg',
        null,
      );

      expect(url).not.toBeNull();
      expect(url).toMatch(
        /^https:\/\/api\.tukituki\.pe\/api\/v1\/storage\/avatars\/driver\/profile-1\?token=/,
      );

      const token = decodeURIComponent(url!.split('token=')[1]);

      expect(verifyAvatarToken('driver', 'profile-1', token, SECRET)).toBe(
        true,
      );
    });

    it('sin photoObjectKey pero con photoUrl legacy, devuelve el legacy tal cual', () => {
      const url = resolveAvatarUrl(
        CONTEXT,
        'passenger',
        'profile-2',
        null,
        'https://cdn.tukituki.pe/legacy.jpg',
      );

      expect(url).toBe('https://cdn.tukituki.pe/legacy.jpg');
    });

    it('sin photoObjectKey ni photoUrl, devuelve null', () => {
      const url = resolveAvatarUrl(CONTEXT, 'driver', 'profile-3', null, null);

      expect(url).toBeNull();
    });

    it('dos llamadas para el mismo perfil generan tokens distintos (no deterministas por expiresAt)', () => {
      const first = resolveAvatarUrl(
        CONTEXT,
        'driver',
        'profile-1',
        'drivers/profile-1/profile/1.jpg',
        null,
      );

      const earlierContext: AvatarUrlContext = {
        ...CONTEXT,
        tokenTtlSeconds: 899,
      };
      const second = resolveAvatarUrl(
        earlierContext,
        'driver',
        'profile-1',
        'drivers/profile-1/profile/1.jpg',
        null,
      );

      expect(first).not.toBe(second);
    });
  });
});
