import { createHmac, timingSafeEqual } from 'node:crypto';

export function createIzipaySignature(
  payloadHttp: string,
  keyHash: string,
): string {
  return createHmac('sha256', Buffer.from(keyHash, 'utf8'))
    .update(Buffer.from(payloadHttp, 'utf8'))
    .digest('base64');
}

export function verifyIzipaySignature(
  payloadHttp: string,
  keyHash: string,
  signature: string,
): boolean {
  const expected = Buffer.from(
    createIzipaySignature(payloadHttp, keyHash),
    'utf8',
  );
  const received = Buffer.from(signature, 'utf8');
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
