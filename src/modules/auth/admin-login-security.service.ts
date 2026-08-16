import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';

const THROTTLED_MESSAGE =
  'Demasiados intentos de acceso; inténtalo nuevamente más tarde';

@Injectable()
export class AdminLoginSecurityService {
  private readonly logger = new Logger(AdminLoginSecurityService.name);

  private readonly secret: string;

  private readonly windowSeconds: number;

  private readonly accountMaxFailures: number;

  private readonly ipMaxAttempts: number;

  private readonly blockSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.secret =
      configService.get<string>('LOGIN_SECURITY_SECRET')?.trim() ||
      configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.windowSeconds = configService.getOrThrow<number>(
      'ADMIN_LOGIN_WINDOW_SECONDS',
    );
    this.accountMaxFailures = configService.getOrThrow<number>(
      'ADMIN_LOGIN_ACCOUNT_MAX_FAILURES',
    );
    this.ipMaxAttempts = configService.getOrThrow<number>(
      'ADMIN_LOGIN_IP_MAX_ATTEMPTS',
    );
    this.blockSeconds = configService.getOrThrow<number>(
      'ADMIN_LOGIN_BLOCK_SECONDS',
    );
  }

  async assertAllowed(
    phoneE164: string,
    ipAddress: string | null,
  ): Promise<void> {
    const accountFingerprint = this.fingerprint('account', phoneE164);
    const ipFingerprint = this.fingerprint('ip', ipAddress ?? 'unknown');

    const [ipAttempts, accountBlocked] = await Promise.all([
      this.redisService.incrementWithTtl(
        this.ipAttemptsKey(ipFingerprint),
        this.windowSeconds,
      ),
      this.redisService.exists(this.accountBlockKey(accountFingerprint)),
    ]);

    if (ipAttempts > this.ipMaxAttempts || accountBlocked) {
      this.logSecurityEvent('admin_login_throttled', {
        accountFingerprint,
        ipFingerprint,
      });
      throw new HttpException(THROTTLED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async registerFailure(
    phoneE164: string,
    ipAddress: string | null,
  ): Promise<void> {
    const accountFingerprint = this.fingerprint('account', phoneE164);
    const ipFingerprint = this.fingerprint('ip', ipAddress ?? 'unknown');
    const failures = await this.redisService.incrementWithTtl(
      this.accountFailuresKey(accountFingerprint),
      this.windowSeconds,
    );

    if (failures >= this.accountMaxFailures) {
      await this.redisService.setWithTtl(
        this.accountBlockKey(accountFingerprint),
        '1',
        this.blockSeconds,
      );
    }

    this.logSecurityEvent('admin_login_failed', {
      accountFingerprint,
      ipFingerprint,
      thresholdReached: failures >= this.accountMaxFailures,
    });
  }

  async registerSuccess(
    phoneE164: string,
    ipAddress: string | null,
    userId: string,
  ): Promise<void> {
    const accountFingerprint = this.fingerprint('account', phoneE164);
    const ipFingerprint = this.fingerprint('ip', ipAddress ?? 'unknown');

    await this.redisService.delete(
      this.accountFailuresKey(accountFingerprint),
      this.accountBlockKey(accountFingerprint),
    );

    this.logSecurityEvent('admin_login_succeeded', {
      accountFingerprint,
      ipFingerprint,
      userId,
    });
  }

  private fingerprint(namespace: 'account' | 'ip', value: string): string {
    return createHmac('sha256', this.secret)
      .update(`admin-login:${namespace}\0${value}`, 'utf8')
      .digest('hex')
      .slice(0, 24);
  }

  private accountFailuresKey(fingerprint: string): string {
    return `auth:admin-login:account:${fingerprint}:failures`;
  }

  private accountBlockKey(fingerprint: string): string {
    return `auth:admin-login:account:${fingerprint}:blocked`;
  }

  private ipAttemptsKey(fingerprint: string): string {
    return `auth:admin-login:ip:${fingerprint}:attempts`;
  }

  private logSecurityEvent(
    event: string,
    details: Record<string, unknown>,
  ): void {
    const payload = JSON.stringify({ event, ...details });

    if (event === 'admin_login_succeeded') {
      this.logger.log(payload);
      return;
    }

    this.logger.warn(payload);
  }
}
