import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async requestPhoneVerification(phoneE164: string): Promise<{
    expiresIn: number;
    debugOtp?: string;
  }> {
    const user = await this.usersService.findByPhoneE164(phoneE164);

    if (!user) {
      throw new NotFoundException(
        'No existe una cuenta registrada con este teléfono',
      );
    }

    if (user.isPhoneVerified) {
      throw new ConflictException('El teléfono ya se encuentra verificado');
    }

    const cooldownKey = this.getCooldownKey(phoneE164);

    if (await this.redisService.exists(cooldownKey)) {
      const retryAfter = await this.redisService.ttl(cooldownKey);

      throw new HttpException(
        `Debes esperar ${retryAfter} segundos para solicitar otro código`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ttl = this.configService.getOrThrow<number>('OTP_TTL_SECONDS');

    const cooldown = this.configService.getOrThrow<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
    );

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    const codeHash = this.hashCode(phoneE164, code);

    await Promise.all([
      this.redisService.setWithTtl(this.getOtpKey(phoneE164), codeHash, ttl),
      this.redisService.setWithTtl(this.getAttemptsKey(phoneE164), '0', ttl),
      this.redisService.setWithTtl(cooldownKey, '1', cooldown),
    ]);

    const nodeEnvironment = this.configService.getOrThrow<string>('NODE_ENV');

    return {
      expiresIn: ttl,

      ...(nodeEnvironment === 'development'
        ? {
            debugOtp: code,
          }
        : {}),
    };
  }

  async verifyPhone(phoneE164: string, code: string) {
    const otpKey = this.getOtpKey(phoneE164);
    const attemptsKey = this.getAttemptsKey(phoneE164);

    const storedHash = await this.redisService.get(otpKey);

    if (!storedHash) {
      throw new BadRequestException('El código ha expirado o no existe');
    }

    const maxAttempts =
      this.configService.getOrThrow<number>('OTP_MAX_ATTEMPTS');

    const attempts = Number((await this.redisService.get(attemptsKey)) ?? '0');

    if (attempts >= maxAttempts) {
      await this.clearOtp(phoneE164);

      throw new HttpException(
        'Superaste el número máximo de intentos',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidateHash = this.hashCode(phoneE164, code);

    if (!this.areHashesEqual(storedHash, candidateHash)) {
      const currentAttempts = await this.redisService.increment(attemptsKey);

      if (currentAttempts >= maxAttempts) {
        await this.clearOtp(phoneE164);

        throw new HttpException(
          'Superaste el número máximo de intentos',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('El código OTP es incorrecto');
    }

    const user = await this.usersService.activatePhone(phoneE164);

    await this.clearOtp(phoneE164);

    return {
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        roles: user.roles,
        status: user.status,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
      },
    };
  }

  private hashCode(phoneE164: string, code: string): string {
    const secret = this.configService.getOrThrow<string>('OTP_HASH_SECRET');

    return createHmac('sha256', secret)
      .update(`${phoneE164}:${code}`)
      .digest('hex');
  }

  private areHashesEqual(storedHash: string, candidateHash: string): boolean {
    const storedBuffer = Buffer.from(storedHash, 'hex');
    const candidateBuffer = Buffer.from(candidateHash, 'hex');

    return (
      storedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(storedBuffer, candidateBuffer)
    );
  }

  private getOtpKey(phoneE164: string): string {
    return `auth:otp:phone:${phoneE164}`;
  }

  private getAttemptsKey(phoneE164: string): string {
    return `auth:otp:phone:${phoneE164}:attempts`;
  }

  private getCooldownKey(phoneE164: string): string {
    return `auth:otp:phone:${phoneE164}:cooldown`;
  }

  private async clearOtp(phoneE164: string): Promise<void> {
    await this.redisService.delete(
      this.getOtpKey(phoneE164),
      this.getAttemptsKey(phoneE164),
      this.getCooldownKey(phoneE164),
    );
  }
}
