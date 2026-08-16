import {
  buildDriverAvatarUrl,
  buildPassengerAvatarUrl,
} from './avatar-url.util';

describe('avatar-url.util', () => {
  it('construye la URL estable de avatar de conductor', () => {
    const url = buildDriverAvatarUrl(
      'https://api.tukituki.pe',
      'api/v1',
      'profile-1',
    );

    expect(url).toBe(
      'https://api.tukituki.pe/api/v1/storage/avatars/driver/profile-1',
    );
  });

  it('construye la URL estable de avatar de pasajero', () => {
    const url = buildPassengerAvatarUrl(
      'https://api.tukituki.pe',
      'api/v1',
      'profile-2',
    );

    expect(url).toBe(
      'https://api.tukituki.pe/api/v1/storage/avatars/passenger/profile-2',
    );
  });

  it('normaliza slashes finales/iniciales del origin y del prefijo', () => {
    const url = buildDriverAvatarUrl(
      'https://api.tukituki.pe/',
      '/api/v1/',
      'profile-3',
    );

    expect(url).toBe(
      'https://api.tukituki.pe/api/v1/storage/avatars/driver/profile-3',
    );
  });
});
