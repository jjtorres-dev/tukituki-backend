import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthSession } from './entities/auth-session.entity';

type AuthSessionRepositoryMock = {
  create: jest.Mock<AuthSession, [Partial<AuthSession>]>;
  save: jest.Mock<Promise<AuthSession>, [AuthSession]>;
};

describe('AuthSessionsService', () => {
  let service: AuthSessionsService;
  let repository: AuthSessionRepositoryMock;

  beforeEach(async () => {
    const repositoryMock: AuthSessionRepositoryMock = {
      create: jest.fn(
        (input: Partial<AuthSession>): AuthSession => input as AuthSession,
      ),

      save: jest.fn((session: AuthSession): Promise<AuthSession> =>
        Promise.resolve(session),
      ),
    };

    const configServiceMock = {
      getOrThrow: jest.fn().mockReturnValue(2592000),
    };

    const dataSourceMock = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSessionsService,

        {
          provide: getRepositoryToken(AuthSession),
          useValue: repositoryMock,
        },

        {
          provide: ConfigService,
          useValue: configServiceMock,
        },

        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<AuthSessionsService>(AuthSessionsService);

    repository = module.get<AuthSessionRepositoryMock>(
      getRepositoryToken(AuthSession),
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe crear una sesión con refresh token', async () => {
    const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

    const result = await service.create({
      userId,
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    });

    expect(result.sessionId).toBeDefined();

    expect(result.refreshToken).toContain(`${result.sessionId}.`);

    expect(result.refreshExpiresIn).toBe(2592000);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);

    const savedSession = repository.save.mock.calls[0]?.[0];

    expect(savedSession).toBeDefined();

    expect(savedSession?.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);

    expect(savedSession?.userId).toBe(userId);
    expect(savedSession?.ipAddress).toBe('127.0.0.1');
    expect(savedSession?.userAgent).toBe('Jest');
  });
});

describe('AuthSessionsService.rotate', () => {
  const sessionId = 'd041f35e-0e19-491d-85b4-dc551edc8a3b';
  const refreshSecret = 'a'.repeat(64);
  const refreshToken = `${sessionId}.${refreshSecret}`;
  const refreshTokenHash = createHash('sha256')
    .update(refreshSecret, 'utf8')
    .digest('hex');

  const buildService = (
    roles: UserRole[],
    isPhoneVerified = false,
    status = UserStatus.ACTIVE,
  ) => {
    const session = {
      id: sessionId,
      userId: 'f544d52a-39e0-4da3-8861-6010355c5dba',
      refreshTokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastUsedAt: null,
      user: {
        id: 'f544d52a-39e0-4da3-8861-6010355c5dba',
        phoneE164: '+51987654321',
        roles,
        status,
        isPhoneVerified,
        createdAt: new Date(),
      } as User,
    } as AuthSession;
    const queryBuilder = {
      addSelect: jest.fn(),
      innerJoinAndSelect: jest.fn(),
      where: jest.fn(),
      setLock: jest.fn(),
      getOne: jest.fn(() => Promise.resolve(session)),
    };
    queryBuilder.addSelect.mockReturnValue(queryBuilder);
    queryBuilder.innerJoinAndSelect.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.setLock.mockReturnValue(queryBuilder);

    const transactionalRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn((value: AuthSession) => Promise.resolve(value)),
    };
    const dataSource = {
      transaction: jest.fn(
        <T>(
          work: (manager: {
            getRepository: () => typeof transactionalRepository;
          }) => Promise<T>,
        ): Promise<T> =>
          work({
            getRepository: () => transactionalRepository,
          }),
      ),
    };
    const service = new AuthSessionsService(
      {} as never,
      {
        getOrThrow: jest.fn(() => 2_592_000),
      } as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );

    return { service, transactionalRepository };
  };

  it('permite refresh a Passenger-only ACTIVE no verificado', async () => {
    const { service, transactionalRepository } = buildService([
      UserRole.PASSENGER,
    ]);

    const result = await service.rotate(refreshToken);

    expect(result.user.isPhoneVerified).toBe(false);
    expect(result.sessionId).toBe(sessionId);
    expect(transactionalRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza refresh a Passenger-only PENDING no verificado', async () => {
    const { service, transactionalRepository } = buildService(
      [UserRole.PASSENGER],
      false,
      UserStatus.PENDING,
    );

    await expect(service.rotate(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(transactionalRepository.save).not.toHaveBeenCalled();
  });

  it.each<[string, UserRole[]]>([
    ['Driver', [UserRole.DRIVER]],
    ['Admin', [UserRole.ADMIN]],
    ['Super Admin', [UserRole.SUPER_ADMIN]],
    ['Passenger + Driver', [UserRole.PASSENGER, UserRole.DRIVER]],
  ])('rechaza refresh a %s ACTIVE no verificado', async (_label, roles) => {
    const { service, transactionalRepository } = buildService(roles);

    await expect(service.rotate(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(transactionalRepository.save).not.toHaveBeenCalled();
  });
});
