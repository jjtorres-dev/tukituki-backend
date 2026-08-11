import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthSessionsService } from '../auth-sessions/auth-sessions.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  const phoneE164 = '+51987654321';
  const createdAt = new Date('2026-08-10T12:00:00.000Z');

  const user = (overrides: Partial<User> = {}): User => ({
    id: 'f544d52a-39e0-4da3-8861-6010355c5dba',
    phoneE164,
    passwordHash: 'password-hash',
    roles: [UserRole.PASSENGER],
    status: UserStatus.ACTIVE,
    isPhoneVerified: false,
    lastLoginAt: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  });

  let service: AuthService;
  let usersService: {
    findByPhoneE164: jest.Mock;
    findByPhoneE164WithPassword: jest.Mock;
    create: jest.Mock;
    markLastLogin: jest.Mock;
  };
  let passwordService: {
    hash: jest.Mock;
    verify: jest.Mock;
  };
  let authSessionsService: {
    create: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      findByPhoneE164: jest.fn(),
      findByPhoneE164WithPassword: jest.fn(),
      create: jest.fn(),
      markLastLogin: jest.fn(() => Promise.resolve()),
    };
    passwordService = {
      hash: jest.fn(() => Promise.resolve('password-hash')),
      verify: jest.fn(() => Promise.resolve(true)),
    };
    authSessionsService = {
      create: jest.fn(() =>
        Promise.resolve({
          sessionId: 'd041f35e-0e19-491d-85b4-dc551edc8a3b',
          refreshToken: 'refresh-token',
          refreshExpiresIn: 2_592_000,
          expiresAt: new Date('2026-09-09T12:00:00.000Z'),
        }),
      ),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      passwordService as unknown as PasswordService,
      {
        signAsync: jest.fn(() => Promise.resolve('access-token')),
      } as unknown as JwtService,
      {
        getOrThrow: jest.fn(() => 900),
      } as unknown as ConfigService,
      authSessionsService as unknown as AuthSessionsService,
    );
  });

  it('registra Passenger como ACTIVE y no verificado, sin crear sesión', async () => {
    usersService.findByPhoneE164.mockResolvedValue(null);
    usersService.create.mockImplementation(
      (input: Partial<User>): Promise<User> =>
        Promise.resolve(user({ ...input })),
    );

    const result = await service.registerPassenger({
      phoneE164,
      password: 'Password123!',
    });

    expect(usersService.create).toHaveBeenCalledWith({
      phoneE164,
      passwordHash: 'password-hash',
      roles: [UserRole.PASSENGER],
      status: UserStatus.ACTIVE,
      isPhoneVerified: false,
    });
    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(result.user.isPhoneVerified).toBe(false);
    expect(result.user.roles).toEqual([UserRole.PASSENGER]);
    expect(authSessionsService.create).not.toHaveBeenCalled();
  });

  it('permite login a Passenger-only ACTIVE no verificado', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(user());

    const result = await service.login(
      { phoneE164, password: 'Password123!' },
      { ipAddress: '127.0.0.1', userAgent: 'Jest' },
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.user.isPhoneVerified).toBe(false);
    expect(authSessionsService.create).toHaveBeenCalledTimes(1);
    expect(usersService.markLastLogin).toHaveBeenCalledTimes(1);
  });

  it('rechaza login a Passenger PENDING no verificado', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({ status: UserStatus.PENDING }),
    );

    await expect(
      service.login(
        { phoneE164, password: 'Password123!' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(authSessionsService.create).not.toHaveBeenCalled();
  });

  it.each<[string, UserRole[]]>([
    ['Driver', [UserRole.DRIVER]],
    ['Admin', [UserRole.ADMIN]],
    ['Super Admin', [UserRole.SUPER_ADMIN]],
    ['Passenger + Driver', [UserRole.PASSENGER, UserRole.DRIVER]],
  ])('rechaza login a %s ACTIVE no verificado', async (_label, roles) => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(user({ roles }));

    await expect(
      service.login(
        { phoneE164, password: 'Password123!' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(authSessionsService.create).not.toHaveBeenCalled();
  });
});
