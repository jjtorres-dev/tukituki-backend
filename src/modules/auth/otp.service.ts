import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
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

  async requestPhoneVerification(
    phoneE164: string,
    ipAddress: string | null,
  ): Promise<{
    expiresIn: number;
    debugOtp?: string;
  }> {
    await this.enforceIpRequestLimit(ipAddress);
    await this.enforcePhoneWindowRequestLimit(phoneE164);

    const ttl = this.configService.getOrThrow<number>('OTP_TTL_SECONDS');

    const cooldown = this.configService.getOrThrow<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
    );

    const cooldownKey = this.getCooldownKey(phoneE164);

    if (await this.redisService.exists(cooldownKey)) {
      const retryAfter = await this.redisService.ttl(cooldownKey);

      throw new HttpException(
        `Debes esperar ${retryAfter} segundos para solicitar otro código`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersService.findByPhoneE164(phoneE164);

    /*
     * OTP-R2: un teléfono sin cuenta registrada recibe exactamente la
     * misma respuesta 200 que un envío real (mismo shape, mismo
     * cooldown aplicado) para no permitir enumerar cuentas por
     * teléfono a través de este endpoint. No se genera, hashea ni
     * almacena ningún código para un teléfono sin cuenta.
     */
    if (!user) {
      await this.redisService.setWithTtl(cooldownKey, '1', cooldown);

      return {
        expiresIn: ttl,
      };
    }

    if (user.isPhoneVerified) {
      throw new ConflictException('El teléfono ya se encuentra verificado');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    const codeHash = this.hashCode(phoneE164, code);

    await Promise.all([
      this.redisService.setWithTtl(this.getOtpKey(phoneE164), codeHash, ttl),
      this.redisService.setWithTtl(this.getAttemptsKey(phoneE164), '0', ttl),
      this.redisService.setWithTtl(cooldownKey, '1', cooldown),
    ]);

    const nodeEnvironment = this.configService.getOrThrow<string>('NODE_ENV');

    const otpDebugEnabled =
      this.configService.get<boolean>('OTP_DEBUG_ENABLED') ?? false;

    const demoOtpAllowed = this.isDemoOtpAllowed(phoneE164);

    return {
      expiresIn: ttl,

      ...(nodeEnvironment === 'development' || otpDebugEnabled || demoOtpAllowed
        ? {
            debugOtp: code,
          }
        : {}),
    };
  }

  /*
   * OTP-DEMO-R1 (TEMPORARY): expone el OTP real generado arriba —
   * nunca uno distinto ni un bypass de verify — únicamente cuando las
   * tres condiciones se cumplen a la vez: el flag demo está activo, el
   * environment real de Railway (no NODE_ENV) es "staging", y el
   * teléfono solicitado es exactamente el de la allowlist QA. Retirar
   * junto con OTP_DEMO_ENABLED cuando OTP-R3 (SMS real) esté listo.
   */
  private isDemoOtpAllowed(phoneE164: string): boolean {
    const demoEnabled =
      this.configService.get<boolean>('OTP_DEMO_ENABLED') ?? false;

    if (!demoEnabled) {
      return false;
    }

    const railwayEnvironmentName =
      this.configService.get<string>('RAILWAY_ENVIRONMENT_NAME') ?? '';

    if (railwayEnvironmentName !== 'staging') {
      return false;
    }

    const allowedPhone =
      this.configService.get<string>('OTP_DEMO_ALLOWED_PHONE_E164') ?? '';

    return allowedPhone.length > 0 && phoneE164 === allowedPhone;
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
      await this.clearOtp(phoneE164, { preserveCooldown: true });

      throw new HttpException(
        'Superaste el número máximo de intentos',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidateHash = this.hashCode(phoneE164, code);

    if (!this.areHashesEqual(storedHash, candidateHash)) {
      const currentAttempts = await this.redisService.increment(attemptsKey);

      if (currentAttempts >= maxAttempts) {
        await this.clearOtp(phoneE164, { preserveCooldown: true });

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

  /*
   * OTP-R2: al agotar los intentos de verificación, el código y el
   * contador siempre se invalidan, pero el cooldown puede
   * preservarse deliberadamente (`preserveCooldown: true`) en vez de
   * borrarse. Sin esto, agotar los intentos dejaba pedir un OTP
   * nuevo de inmediato (el resend cooldown se borraba junto con
   * todo lo demás), permitiendo un loop instantáneo de
   * intentos→nuevo código→intentos. Se aplica siempre una duración
   * de cooldown completa y fresca (no la que quedaba de la
   * solicitud original), para garantizar una espera mínima real tras
   * agotar los intentos sin importar cuánto haya tardado el usuario
   * en consumirlos.
   */
  private async clearOtp(
    phoneE164: string,
    options: { preserveCooldown?: boolean } = {},
  ): Promise<void> {
    if (options.preserveCooldown) {
      const cooldown = this.configService.getOrThrow<number>(
        'OTP_RESEND_COOLDOWN_SECONDS',
      );

      await Promise.all([
        this.redisService.delete(
          this.getOtpKey(phoneE164),
          this.getAttemptsKey(phoneE164),
        ),
        this.redisService.setWithTtl(
          this.getCooldownKey(phoneE164),
          '1',
          cooldown,
        ),
      ]);

      return;
    }

    await this.redisService.delete(
      this.getOtpKey(phoneE164),
      this.getAttemptsKey(phoneE164),
      this.getCooldownKey(phoneE164),
    );
  }

  /*
   * OTP-R2: protección de costo dedicada a POST /auth/otp/request,
   * en profundidad respecto al throttle global (RATE_LIMIT_*, por
   * IP, aplicado a toda la API). Los contadores se identifican por
   * huella HMAC (nunca la IP/teléfono en claro como key de Redis),
   * mismo patrón que AdminLoginSecurityService.
   */
  private async enforceIpRequestLimit(ipAddress: string | null): Promise<void> {
    const limit = this.configService.getOrThrow<number>('OTP_REQUEST_IP_LIMIT');

    const windowSeconds = this.configService.getOrThrow<number>(
      'OTP_REQUEST_IP_WINDOW_SECONDS',
    );

    const fingerprint = this.fingerprint('ip', ipAddress ?? 'unknown');

    const count = await this.redisService.incrementWithTtl(
      `auth:otp:request:ip:${fingerprint}`,
      windowSeconds,
    );

    if (count > limit) {
      throw new HttpException(
        'Demasiadas solicitudes de código; inténtalo nuevamente más tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async enforcePhoneWindowRequestLimit(
    phoneE164: string,
  ): Promise<void> {
    const limit = this.configService.getOrThrow<number>(
      'OTP_REQUEST_PHONE_LIMIT',
    );

    const windowSeconds = this.configService.getOrThrow<number>(
      'OTP_REQUEST_PHONE_WINDOW_SECONDS',
    );

    const fingerprint = this.fingerprint('phone-window', phoneE164);

    const count = await this.redisService.incrementWithTtl(
      `auth:otp:request:phone-window:${fingerprint}`,
      windowSeconds,
    );

    if (count > limit) {
      throw new HttpException(
        'Superaste el número máximo de solicitudes de código para este teléfono; inténtalo más tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private fingerprint(namespace: 'ip' | 'phone-window', value: string): string {
    const secret = this.configService.getOrThrow<string>('OTP_HASH_SECRET');

    return createHmac('sha256', secret)
      .update(`otp-request:${namespace}\0${value}`, 'utf8')
      .digest('hex')
      .slice(0, 24);
  }
}
