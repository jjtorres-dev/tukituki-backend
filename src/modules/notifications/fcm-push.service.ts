import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';

import type {
  PushMessage,
  PushSendResult,
} from './interfaces/push-message.interface';

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface FcmSuccessResponse {
  name?: string;
}

const FIREBASE_MESSAGING_SCOPE =
  'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private readonly enabled: boolean;
  private readonly serviceAccount: FirebaseServiceAccount | null;
  private readonly projectId: string | null;
  private cachedAccessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('FCM_ENABLED', false);
    this.serviceAccount = this.enabled ? this.readServiceAccount() : null;
    this.projectId =
      this.configService.get<string>('FIREBASE_PROJECT_ID') ??
      this.serviceAccount?.project_id ??
      null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    if (!this.enabled) {
      return { kind: 'skipped' };
    }

    if (!this.projectId || !this.serviceAccount) {
      return {
        kind: 'failed',
        error: 'La configuración de Firebase no está completa',
        invalidToken: false,
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: {
                title: message.title,
                body: message.body,
              },
              data: message.data,
              android: {
                priority: 'high',
              },
              apns: {
                headers: {
                  'apns-priority': '10',
                },
              },
            },
          }),
        },
      );

      const rawBody = await response.text();

      if (!response.ok) {
        return {
          kind: 'failed',
          error: this.fcmErrorMessage(response.status, rawBody),
          invalidToken: this.isInvalidRegistrationToken(
            response.status,
            rawBody,
          ),
        };
      }

      const body = this.parseJson<FcmSuccessResponse>(rawBody);
      return {
        kind: 'sent',
        messageId: body?.name ?? 'fcm-message-sent',
      };
    } catch (error: unknown) {
      const messageText = this.errorMessage(error);
      this.logger.warn(`FCM no pudo enviar la notificación: ${messageText}`);
      return {
        kind: 'failed',
        error: messageText,
        invalidToken: false,
      };
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.accessTokenExpiresAt - 60_000 > now) {
      return this.cachedAccessToken;
    }

    if (!this.serviceAccount) {
      throw new Error('No existe una cuenta de servicio de Firebase');
    }

    const tokenUri = this.serviceAccount.token_uri ?? DEFAULT_TOKEN_URI;
    const issuedAt = Math.floor(now / 1000);
    const assertion = this.createSignedAssertion(
      this.serviceAccount,
      tokenUri,
      issuedAt,
    );
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `OAuth de Firebase respondió ${response.status}: ${rawBody.slice(0, 500)}`,
      );
    }

    const tokenResponse = this.parseJson<OAuthTokenResponse>(rawBody);
    if (!tokenResponse?.access_token) {
      throw new Error('OAuth de Firebase no devolvió access_token');
    }

    const expiresIn = tokenResponse.expires_in ?? 3600;
    this.cachedAccessToken = tokenResponse.access_token;
    this.accessTokenExpiresAt = now + expiresIn * 1000;
    return tokenResponse.access_token;
  }

  private createSignedAssertion(
    account: FirebaseServiceAccount,
    tokenUri: string,
    issuedAt: number,
  ): string {
    const header = this.base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = this.base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: FIREBASE_MESSAGING_SCOPE,
        aud: tokenUri,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    );
    const unsignedToken = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(account.private_key).toString('base64url');
    return `${unsignedToken}.${signature}`;
  }

  private readServiceAccount(): FirebaseServiceAccount {
    const encoded = this.configService.getOrThrow<string>(
      'FIREBASE_SERVICE_ACCOUNT_BASE64',
    );
    let parsed: unknown;

    try {
      parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_BASE64 no contiene un JSON base64 válido',
      );
    }

    if (!this.isServiceAccount(parsed)) {
      throw new Error(
        'La cuenta de servicio de Firebase no contiene project_id, client_email y private_key',
      );
    }

    return parsed;
  }

  private isServiceAccount(value: unknown): value is FirebaseServiceAccount {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.project_id === 'string' &&
      typeof candidate.client_email === 'string' &&
      typeof candidate.private_key === 'string' &&
      (candidate.token_uri === undefined ||
        typeof candidate.token_uri === 'string')
    );
  }

  private base64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private parseJson<T>(raw: string): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private fcmErrorMessage(status: number, rawBody: string): string {
    return `FCM respondió ${status}: ${rawBody.slice(0, 500)}`;
  }

  private isInvalidRegistrationToken(status: number, body: string): boolean {
    if (status !== 400 && status !== 404) return false;
    return (
      body.includes('UNREGISTERED') ||
      body.includes('registration-token-not-registered')
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
