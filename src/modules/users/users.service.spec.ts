import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    const repositoryMock = {
      findOne: jest.fn(),
      save: jest.fn((user: User) => Promise.resolve(user)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe buscar un usuario por telefono', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.findByPhoneE164('+51987654321');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        phoneE164: '+51987654321',
      },
    });

    expect(result).toBeNull();
  });

  it.each([
    UserStatus.ACTIVE,
    UserStatus.PENDING,
    UserStatus.SUSPENDED,
    UserStatus.BLOCKED,
  ])('OTP verifica el telefono y preserva status %s', async (status) => {
    const user = {
      id: 'f544d52a-39e0-4da3-8861-6010355c5dba',
      phoneE164: '+51987654321',
      roles: [UserRole.PASSENGER],
      status,
      isPhoneVerified: false,
    } as User;
    repository.findOne.mockResolvedValue(user);

    const result = await service.activatePhone(user.phoneE164);

    expect(result.isPhoneVerified).toBe(true);
    expect(result.status).toBe(status);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isPhoneVerified: true,
        status,
      }),
    );
  });
});
