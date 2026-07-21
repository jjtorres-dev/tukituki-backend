import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { UserStatus } from '../users/enums/user-status.enum';
import { AuthSession } from './entities/auth-session.entity';
import type {
  CreateAuthSessionInput,
  CreatedAuthSession,
  RotatedAuthSession,
} from './interfaces/create-auth-session.interface';

@Injectable()
export class AuthSessionsService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly authSessionsRepository: Repository<AuthSession>,

    private readonly configService: ConfigService,

    private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateAuthSessionInput): Promise<CreatedAuthSession> {
    const refreshExpiresIn = this.configService.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_SECONDS',
    );

    const sessionId = randomUUID();
    const refreshSecret = this.generateRefreshSecret();

    const refreshToken = `${sessionId}.${refreshSecret}`;

    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    const session = this.authSessionsRepository.create({
      id: sessionId,
      userId: input.userId,

      refreshTokenHash: this.hashRefreshSecret(refreshSecret),

      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      ipAddress: input.ipAddress ?? null,

      userAgent: input.userAgent?.slice(0, 512) ?? null,
    });

    await this.authSessionsRepository.save(session);

    return {
      sessionId,
      refreshToken,
      refreshExpiresIn,
      expiresAt,
    };
  }

  async rotate(refreshToken: string): Promise<RotatedAuthSession> {
    const { sessionId, refreshSecret } = this.parseRefreshToken(refreshToken);

    const candidateHash = this.hashRefreshSecret(refreshSecret);

    return this.dataSource.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(AuthSession);

      const session = await repository
        .createQueryBuilder('session')
        .addSelect('session.refreshTokenHash')
        .innerJoinAndSelect('session.user', 'user')
        .where('session.id = :sessionId', {
          sessionId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException(
          'El refresh token es inválido o ha vencido',
        );
      }

      if (
        !session.user.isPhoneVerified ||
        session.user.status !== UserStatus.ACTIVE
      ) {
        throw new UnauthorizedException(
          'La cuenta asociada no está habilitada',
        );
      }

      if (!this.areHashesEqual(session.refreshTokenHash, candidateHash)) {
        throw new UnauthorizedException(
          'El refresh token es inválido o ha vencido',
        );
      }

      const newRefreshSecret = this.generateRefreshSecret();

      session.refreshTokenHash = this.hashRefreshSecret(newRefreshSecret);

      session.lastUsedAt = new Date();

      await repository.save(session);

      const refreshExpiresIn = Math.max(
        0,
        Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
      );

      return {
        sessionId: session.id,

        refreshToken: `${session.id}.${newRefreshSecret}`,

        refreshExpiresIn,
        expiresAt: session.expiresAt,
        user: session.user,
      };
    });
  }

  private generateRefreshSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshSecret(refreshSecret: string): string {
    return createHash('sha256').update(refreshSecret, 'utf8').digest('hex');
  }

  private parseRefreshToken(refreshToken: string): {
    sessionId: string;
    refreshSecret: string;
  } {
    const parts = refreshToken.split('.');

    if (parts.length !== 2) {
      throw new UnauthorizedException(
        'El refresh token es inválido o ha vencido',
      );
    }

    const [sessionId, refreshSecret] = parts;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const secretPattern = /^[A-Za-z0-9_-]{64}$/;

    if (
      !sessionId ||
      !refreshSecret ||
      !uuidPattern.test(sessionId) ||
      !secretPattern.test(refreshSecret)
    ) {
      throw new UnauthorizedException(
        'El refresh token es inválido o ha vencido',
      );
    }

    return {
      sessionId,
      refreshSecret,
    };
  }

  private areHashesEqual(storedHash: string, candidateHash: string): boolean {
    const storedBuffer = Buffer.from(storedHash, 'hex');

    const candidateBuffer = Buffer.from(candidateHash, 'hex');

    return (
      storedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(storedBuffer, candidateBuffer)
    );
  }
}
