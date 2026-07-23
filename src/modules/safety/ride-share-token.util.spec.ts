import {
  generateRideShareToken,
  hashRideShareAccessIp,
  hashRideShareToken,
} from './ride-share-token.util';

describe('ride-share-token.util', () => {
  it('genera tokens de alta entropía y solo persiste un hash SHA-256', () => {
    const first = generateRideShareToken();
    const second = generateRideShareToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashRideShareToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRideShareToken(first)).not.toContain(first);
  });

  it('anonimiza la IP usando una sal diferente', () => {
    const ip = '127.0.0.1';

    expect(hashRideShareAccessIp(ip, 'secret-one')).not.toBe(
      hashRideShareAccessIp(ip, 'secret-two'),
    );
  });
});
