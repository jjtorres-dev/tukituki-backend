import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

  beforeEach(async () => {
    const repositoryMock = {
      findOne: jest.fn(),
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

  it('debe buscar un usuario por teléfono', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.findByPhoneE164('+51987654321');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        phoneE164: '+51987654321',
      },
    });

    expect(result).toBeNull();
  });
});
