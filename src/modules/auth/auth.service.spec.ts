import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthSessionsService } from '../auth-sessions/auth-sessions.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { AdminLoginSecurityService } from './admin-login-security.service';

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
    verifyWithFallback: jest.Mock;
  };
  let authSessionsService: {
    create: jest.Mock;
  };
  let adminLoginSecurityService: {
    assertAllowed: jest.Mock;
    registerFailure: jest.Mock;
    registerSuccess: jest.Mock;
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
      verifyWithFallback: jest.fn(() => Promise.resolve(true)),
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
    adminLoginSecurityService = {
      assertAllowed: jest.fn(() => Promise.resolve()),
      registerFailure: jest.fn(() => Promise.resolve()),
      registerSuccess: jest.fn(() => Promise.resolve()),
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
      adminLoginSecurityService as unknown as AdminLoginSecurityService,
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
    ['Passenger + Driver', [UserRole.PASSENGER, UserRole.DRIVER]],
  ])(
    'permite login a %s ACTIVE no verificado durante MVP (isPhoneVerified no gatea consumidor)',
    async (_label, roles) => {
      usersService.findByPhoneE164WithPassword.mockResolvedValue(
        user({ roles }),
      );

      const result = await service.login(
        { phoneE164, password: 'Password123!' },
        { ipAddress: null, userAgent: null },
      );

      expect(result.accessToken).toBe('access-token');
      expect(result.user.isPhoneVerified).toBe(false);
      expect(authSessionsService.create).toHaveBeenCalledTimes(1);
    },
  );

  it.each<[string, UserRole[]]>([
    ['Admin', [UserRole.ADMIN]],
    ['Super Admin', [UserRole.SUPER_ADMIN]],
  ])(
    'rechaza login genérico a %s ACTIVE no verificado (seguridad administrativa preservada)',
    async (_label, roles) => {
      usersService.findByPhoneE164WithPassword.mockResolvedValue(
        user({ roles, isPhoneVerified: false }),
      );

      await expect(
        service.login(
          { phoneE164, password: 'Password123!' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(authSessionsService.create).not.toHaveBeenCalled();
    },
  );

  it.each<[string, UserRole[]]>([
    ['Passenger + Admin', [UserRole.PASSENGER, UserRole.ADMIN]],
    ['Driver + Super Admin', [UserRole.DRIVER, UserRole.SUPER_ADMIN]],
  ])(
    'rechaza login genérico a %s ACTIVE no verificado (el rol administrativo gana)',
    async (_label, roles) => {
      usersService.findByPhoneE164WithPassword.mockResolvedValue(
        user({ roles, isPhoneVerified: false }),
      );

      await expect(
        service.login(
          { phoneE164, password: 'Password123!' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(authSessionsService.create).not.toHaveBeenCalled();
    },
  );

  it('permite login genérico a Admin ACTIVE verificado', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({ roles: [UserRole.ADMIN], isPhoneVerified: true }),
    );

    const result = await service.login(
      { phoneE164, password: 'Password123!' },
      { ipAddress: null, userAgent: null },
    );

    expect(result.accessToken).toBe('access-token');
    expect(authSessionsService.create).toHaveBeenCalledTimes(1);
  });

  it.each<[string, UserStatus]>([
    ['SUSPENDED', UserStatus.SUSPENDED],
    ['BLOCKED', UserStatus.BLOCKED],
  ])(
    'rechaza login a Driver %s aunque isPhoneVerified sea true',
    async (_label, status) => {
      usersService.findByPhoneE164WithPassword.mockResolvedValue(
        user({ roles: [UserRole.DRIVER], status, isPhoneVerified: true }),
      );

      await expect(
        service.login(
          { phoneE164, password: 'Password123!' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(authSessionsService.create).not.toHaveBeenCalled();
    },
  );

  it('usa una comparación bcrypt ficticia cuando el usuario no existe', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(null);
    passwordService.verifyWithFallback.mockResolvedValue(false);

    await expect(
      service.login(
        { phoneE164, password: 'Password123!' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(passwordService.verifyWithFallback).toHaveBeenCalledWith(
      'Password123!',
      undefined,
    );
  });

  it('permite el endpoint administrativo solo a un administrador elegible', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({
        roles: [UserRole.ADMIN],
        isPhoneVerified: true,
      }),
    );

    const result = await service.loginAdmin(
      { phoneE164, password: 'Password123!' },
      { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
    );

    expect(result.accessToken).toBe('access-token');
    expect(adminLoginSecurityService.assertAllowed).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
    );
    expect(adminLoginSecurityService.registerSuccess).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
      expect.any(String),
    );
    expect(adminLoginSecurityService.registerFailure).not.toHaveBeenCalled();
  });

  it('rechaza con respuesta genérica una cuenta no administrativa', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({
        roles: [UserRole.PASSENGER],
        isPhoneVerified: true,
      }),
    );

    await expect(
      service.loginAdmin(
        { phoneE164, password: 'Password123!' },
        { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
      ),
    ).rejects.toMatchObject({
      message: 'Teléfono o contraseña incorrectos',
    });

    expect(adminLoginSecurityService.registerFailure).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
    );
    expect(authSessionsService.create).not.toHaveBeenCalled();
  });

  it('permite el endpoint administrativo a SUPER_ADMIN elegible', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({
        roles: [UserRole.SUPER_ADMIN],
        isPhoneVerified: true,
      }),
    );

    const result = await service.loginAdmin(
      { phoneE164, password: 'Password123!' },
      { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.user.roles).toEqual([UserRole.SUPER_ADMIN]);
    expect(adminLoginSecurityService.registerFailure).not.toHaveBeenCalled();
  });

  it('rechaza el endpoint administrativo para DRIVER aunque las credenciales sean válidas', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({
        roles: [UserRole.DRIVER],
        isPhoneVerified: true,
      }),
    );

    await expect(
      service.loginAdmin(
        { phoneE164, password: 'Password123!' },
        { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
      ),
    ).rejects.toMatchObject({
      message: 'Teléfono o contraseña incorrectos',
    });

    expect(adminLoginSecurityService.registerFailure).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
    );
    expect(authSessionsService.create).not.toHaveBeenCalled();
  });

  it('rechaza el login admin con contraseña incorrecta', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({ roles: [UserRole.ADMIN], isPhoneVerified: true }),
    );
    passwordService.verifyWithFallback.mockResolvedValue(false);

    await expect(
      service.loginAdmin(
        { phoneE164, password: 'wrong-password' },
        { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminLoginSecurityService.registerFailure).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
    );
  });

  it('rechaza el login admin para un usuario inexistente, ejecutando igualmente el chequeo de rate limit', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(null);
    passwordService.verifyWithFallback.mockResolvedValue(false);

    await expect(
      service.loginAdmin(
        { phoneE164, password: 'Password123!' },
        { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminLoginSecurityService.assertAllowed).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
    );
    expect(adminLoginSecurityService.registerFailure).toHaveBeenCalledWith(
      phoneE164,
      '203.0.113.10',
    );
    expect(authSessionsService.create).not.toHaveBeenCalled();
  });

  it.each<[string, UserStatus]>([
    ['SUSPENDED', UserStatus.SUSPENDED],
    ['BLOCKED', UserStatus.BLOCKED],
    ['PENDING', UserStatus.PENDING],
  ])(
    'rechaza el login admin cuando el status del usuario es %s',
    async (_label, status) => {
      usersService.findByPhoneE164WithPassword.mockResolvedValue(
        user({ roles: [UserRole.ADMIN], isPhoneVerified: true, status }),
      );

      await expect(
        service.loginAdmin(
          { phoneE164, password: 'Password123!' },
          { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(authSessionsService.create).not.toHaveBeenCalled();
    },
  );

  it('rechaza el login admin si el teléfono no está verificado', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({ roles: [UserRole.ADMIN], isPhoneVerified: false }),
    );

    await expect(
      service.loginAdmin(
        { phoneE164, password: 'Password123!' },
        { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authSessionsService.create).not.toHaveBeenCalled();
  });

  it('la respuesta del login admin no expone password ni passwordHash', async () => {
    usersService.findByPhoneE164WithPassword.mockResolvedValue(
      user({ roles: [UserRole.ADMIN], isPhoneVerified: true }),
    );

    const result = await service.loginAdmin(
      { phoneE164, password: 'Password123!' },
      { ipAddress: '203.0.113.10', userAgent: 'Dashboard' },
    );

    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('password-hash');
  });
});
