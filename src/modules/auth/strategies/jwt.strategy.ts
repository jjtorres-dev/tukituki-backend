import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthSessionsService } from '../../auth-sessions/auth-sessions.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authSessionsService: AuthSessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      payload.type !== 'access'
    ) {
      throw new UnauthorizedException('El token proporcionado no es válido');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('El usuario del token ya no existe');
    }

    if (!user.isPhoneVerified || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('La cuenta no está habilitada');
    }

    const sessionIsActive = await this.authSessionsService.isActive(
      payload.sid,
      user.id,
    );

    if (!sessionIsActive) {
      throw new UnauthorizedException('La sesión ha expirado o fue cerrada');
    }

    return {
      id: user.id,
      sessionId: payload.sid,
      phoneE164: user.phoneE164,
      roles: user.roles,
      status: user.status,
      isPhoneVerified: user.isPhoneVerified,
      createdAt: user.createdAt,
    };
  }
}
