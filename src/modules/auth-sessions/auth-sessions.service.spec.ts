import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

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
