import { createHash, randomBytes } from 'node:crypto';

export function generateRideShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRideShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashRideShareAccessIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
