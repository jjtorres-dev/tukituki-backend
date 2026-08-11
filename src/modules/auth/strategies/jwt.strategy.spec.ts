import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthSessionsService } from '../../auth-sessions/auth-sessions.service';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const sessionId = 'd041f35e-0e19-491d-85b4-dc551edc8a3b';
  const phoneE164 = '+51987654321';
  const createdAt = new Date('2026-08-10T12:00:00.000Z');
  const payload: JwtPayload = {
    sub: userId,
    sid: sessionId,
    phoneE164,
    roles: [UserRole.PASSENGER],
    type: 'access',
  };

  const user = (roles: UserRole[], status = UserStatus.ACTIVE): User =>
    ({
      id: userId,
      phoneE164,
      roles,
      status,
      isPhoneVerified: false,
      createdAt,
    }) as User;

  let strategy: JwtStrategy;
  let usersService: { findById: jest.Mock };
  let authSessionsService: { isActive: jest.Mock };

  beforeEach(() => {
    usersService = {
      findById: jest.fn(),
    };
    authSessionsService = {
      isActive: jest.fn(() => Promise.resolve(true)),
    };

    strategy = new JwtStrategy(
      {
        getOrThrow: jest.fn(() => 'jwt-access-secret'),
      } as unknown as ConfigService,
      usersService as unknown as UsersService,
      authSessionsService as unknown as AuthSessionsService,
    );
  });

  it('permite Passenger-only ACTIVE no verificado con sesión activa', async () => {
    usersService.findById.mockResolvedValue(user([UserRole.PASSENGER]));

    const result = await strategy.validate(payload);

    expect(result.isPhoneVerified).toBe(false);
    expect(result.roles).toEqual([UserRole.PASSENGER]);
    expect(authSessionsService.isActive).toHaveBeenCalledWith(
      sessionId,
      userId,
    );
  });

  it('rechaza JWT de Passenger-only PENDING no verificado', async () => {
    usersService.findById.mockResolvedValue(
      user([UserRole.PASSENGER], UserStatus.PENDING),
    );

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(authSessionsService.isActive).not.toHaveBeenCalled();
  });

  it.each<[string, UserRole[]]>([
    ['Driver', [UserRole.DRIVER]],
    ['Admin', [UserRole.ADMIN]],
    ['Super Admin', [UserRole.SUPER_ADMIN]],
    ['Passenger + Driver', [UserRole.PASSENGER, UserRole.DRIVER]],
  ])('rechaza JWT de %s ACTIVE no verificado', async (_label, roles) => {
    usersService.findById.mockResolvedValue(user(roles));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(authSessionsService.isActive).not.toHaveBeenCalled();
  });
});
