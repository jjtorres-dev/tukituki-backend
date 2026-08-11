import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { isPassengerOnlyUser } from '../users/utils/user-auth-policy.util';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './password.service';
import { AuthSessionsService } from '../auth-sessions/auth-sessions.service';
import type { LoginContext } from './interfaces/login-context.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authSessionsService: AuthSessionsService,
  ) {}

  async registerPassenger(
    dto: RegisterPassengerDto,
  ): Promise<RegisterResponseDto> {
    const existingUser = await this.usersService.findByPhoneE164(dto.phoneE164);

    if (existingUser) {
      throw new ConflictException(
        'Ya existe una cuenta registrada con este teléfono',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.usersService.create({
      phoneE164: dto.phoneE164,
      passwordHash,
      roles: [UserRole.PASSENGER],
      status: UserStatus.ACTIVE,
      isPhoneVerified: false,
    });

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

  async login(dto: LoginDto, context: LoginContext): Promise<LoginResponseDto> {
    const user = await this.usersService.findByPhoneE164WithPassword(
      dto.phoneE164,
    );

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    }

    const passwordIsValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    }

    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.PENDING) {
        throw new ForbiddenException('Debes verificar tu número telefónico');
      }

      throw new ForbiddenException(
        'La cuenta no está habilitada para iniciar sesión',
      );
    }

    if (!user.isPhoneVerified && !isPassengerOnlyUser(user)) {
      throw new ForbiddenException('Debes verificar tu número telefónico');
    }

    const session = await this.authSessionsService.create({
      userId: user.id,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    const payload: JwtPayload = {
      sub: user.id,
      sid: session.sessionId,
      phoneE164: user.phoneE164,
      roles: user.roles,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const expiresIn = this.configService.getOrThrow<number>(
      'JWT_ACCESS_TTL_SECONDS',
    );

    await this.usersService.markLastLogin(user.id);

    return {
      accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      tokenType: 'Bearer',
      expiresIn,
      refreshExpiresIn: session.refreshExpiresIn,

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

  async refresh(refreshToken: string): Promise<LoginResponseDto> {
    const rotatedSession = await this.authSessionsService.rotate(refreshToken);

    const user = rotatedSession.user;

    const payload: JwtPayload = {
      sub: user.id,
      sid: rotatedSession.sessionId,
      phoneE164: user.phoneE164,
      roles: user.roles,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const expiresIn = this.configService.getOrThrow<number>(
      'JWT_ACCESS_TTL_SECONDS',
    );

    return {
      accessToken,

      refreshToken: rotatedSession.refreshToken,

      sessionId: rotatedSession.sessionId,

      tokenType: 'Bearer',
      expiresIn,

      refreshExpiresIn: rotatedSession.refreshExpiresIn,

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
}
