import {
  createIzipaySignature,
  verifyIzipaySignature,
} from './izipay-signature.util';

describe('Izipay signature utilities', () => {
  const payload = '{"code":"00","transactionId":"transaction-123"}';
  const keyHash = 'sandbox-key-hash-with-enough-entropy';

  it('crea y valida una firma HMAC-SHA256 en Base64', () => {
    const signature = createIzipaySignature(payload, keyHash);

    expect(signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(verifyIzipaySignature(payload, keyHash, signature)).toBe(true);
  });

  it('rechaza un payload o una firma alterados', () => {
    const signature = createIzipaySignature(payload, keyHash);

    expect(verifyIzipaySignature(`${payload} `, keyHash, signature)).toBe(
      false,
    );
    expect(verifyIzipaySignature(payload, keyHash, `${signature}A`)).toBe(
      false,
    );
  });
});
