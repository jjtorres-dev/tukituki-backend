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

  const user = (
    roles: UserRole[],
    status = UserStatus.ACTIVE,
    isPhoneVerified = false,
  ): User =>
    ({
      id: userId,
      phoneE164,
      roles,
      status,
      isPhoneVerified,
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

  it.each<[string, UserRole[]]>([
    ['Passenger', [UserRole.PASSENGER]],
    ['Driver', [UserRole.DRIVER]],
    ['Passenger + Driver', [UserRole.PASSENGER, UserRole.DRIVER]],
  ])(
    'permite JWT de %s ACTIVE no verificado durante MVP (isPhoneVerified no gatea consumidor)',
    async (_label, roles) => {
      usersService.findById.mockResolvedValue(
        user(roles, UserStatus.ACTIVE, false),
      );

      const result = await strategy.validate(payload);

      expect(result.roles).toEqual(roles);
      expect(result.isPhoneVerified).toBe(false);
      expect(authSessionsService.isActive).toHaveBeenCalledWith(
        sessionId,
        userId,
      );
    },
  );

  it.each<[string, UserRole[]]>([
    ['Passenger', [UserRole.PASSENGER]],
    ['Driver', [UserRole.DRIVER]],
  ])('permite JWT de %s ACTIVE verificado', async (_label, roles) => {
    usersService.findById.mockResolvedValue(
      user(roles, UserStatus.ACTIVE, true),
    );

    const result = await strategy.validate(payload);

    expect(result.isPhoneVerified).toBe(true);
    expect(authSessionsService.isActive).toHaveBeenCalledWith(
      sessionId,
      userId,
    );
  });

  it.each<[string, UserRole[]]>([
    ['Admin', [UserRole.ADMIN]],
    ['Super Admin', [UserRole.SUPER_ADMIN]],
  ])(
    'rechaza JWT de %s ACTIVE no verificado (seguridad administrativa preservada)',
    async (_label, roles) => {
      usersService.findById.mockResolvedValue(
        user(roles, UserStatus.ACTIVE, false),
      );

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(authSessionsService.isActive).not.toHaveBeenCalled();
    },
  );

  it.each<[string, UserRole[]]>([
    ['Admin', [UserRole.ADMIN]],
    ['Super Admin', [UserRole.SUPER_ADMIN]],
  ])('permite JWT de %s ACTIVE verificado', async (_label, roles) => {
    usersService.findById.mockResolvedValue(
      user(roles, UserStatus.ACTIVE, true),
    );

    const result = await strategy.validate(payload);

    expect(result.isPhoneVerified).toBe(true);
    expect(authSessionsService.isActive).toHaveBeenCalledWith(
      sessionId,
      userId,
    );
  });

  it.each<[string, UserRole[]]>([
    ['Passenger + Admin', [UserRole.PASSENGER, UserRole.ADMIN]],
    ['Driver + Super Admin', [UserRole.DRIVER, UserRole.SUPER_ADMIN]],
  ])(
    'rechaza JWT de %s ACTIVE no verificado (el rol administrativo gana)',
    async (_label, roles) => {
      usersService.findById.mockResolvedValue(
        user(roles, UserStatus.ACTIVE, false),
      );

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(authSessionsService.isActive).not.toHaveBeenCalled();
    },
  );

  it.each<[string, UserRole[], UserStatus]>([
    ['Passenger', [UserRole.PASSENGER], UserStatus.PENDING],
    ['Driver', [UserRole.DRIVER], UserStatus.SUSPENDED],
    ['Admin', [UserRole.ADMIN], UserStatus.BLOCKED],
  ])(
    'rechaza JWT de %s cuando el status no es ACTIVE, aunque isPhoneVerified sea true',
    async (_label, roles, status) => {
      usersService.findById.mockResolvedValue(user(roles, status, true));

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(authSessionsService.isActive).not.toHaveBeenCalled();
    },
  );
});
