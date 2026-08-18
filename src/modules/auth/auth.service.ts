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
import type { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { isUserOperationallyEnabled } from '../users/utils/user-auth-policy.util';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './password.service';
import { AuthSessionsService } from '../auth-sessions/auth-sessions.service';
import type { LoginContext } from './interfaces/login-context.interface';
import { AdminLoginSecurityService } from './admin-login-security.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authSessionsService: AuthSessionsService,
    private readonly adminLoginSecurityService: AdminLoginSecurityService,
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

    const passwordIsValid = await this.passwordService.verifyWithFallback(
      dto.password,
      user?.passwordHash,
    );

    if (!user || !passwordIsValid) {
      throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    }

    if (!isUserOperationallyEnabled(user)) {
      if (user.status === UserStatus.PENDING) {
        throw new ForbiddenException('Debes verificar tu número telefónico');
      }

      throw new ForbiddenException(
        'La cuenta no está habilitada para iniciar sesión',
      );
    }

    return this.createSession(user, context);
  }

  async loginAdmin(
    dto: LoginDto,
    context: LoginContext,
  ): Promise<LoginResponseDto> {
    const ipAddress = context.ipAddress ?? null;

    await this.adminLoginSecurityService.assertAllowed(
      dto.phoneE164,
      ipAddress,
    );

    const user = await this.usersService.findByPhoneE164WithPassword(
      dto.phoneE164,
    );
    const passwordIsValid = await this.passwordService.verifyWithFallback(
      dto.password,
      user?.passwordHash,
    );
    const hasAdministrativeRole =
      user?.roles.some((role) =>
        [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(role),
      ) ?? false;
    const isEligible =
      Boolean(user) &&
      passwordIsValid &&
      hasAdministrativeRole &&
      user?.status === UserStatus.ACTIVE &&
      user.isPhoneVerified;

    if (!user || !isEligible) {
      await this.adminLoginSecurityService.registerFailure(
        dto.phoneE164,
        ipAddress,
      );
      throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    }

    await this.adminLoginSecurityService.registerSuccess(
      dto.phoneE164,
      ipAddress,
      user.id,
    );

    return this.createSession(user, context);
  }

  private async createSession(
    user: User,
    context: LoginContext,
  ): Promise<LoginResponseDto> {
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
