import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import type { DeepPartial, FindOneOptions } from 'typeorm';

import { PassengerProfile } from './entities/passenger-profile.entity';
import { PassengersService } from './passengers.service';

type RepositoryMock = {
  findOne: jest.Mock<
    Promise<PassengerProfile | null>,
    [FindOneOptions<PassengerProfile>]
  >;

  create: jest.Mock<PassengerProfile, [DeepPartial<PassengerProfile>]>;

  save: jest.Mock<Promise<PassengerProfile>, [PassengerProfile]>;
};

describe('PassengersService', () => {
  let service: PassengersService;
  let repository: RepositoryMock;

  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const profile: PassengerProfile = {
    id: 'a73d4092-d959-4c41-846c-b3457103106f',
    userId,
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    photoUrl: null,
    emergencyContactName: null,
    emergencyContactPhoneE164: null,
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T12:00:00.000Z'),
  } as PassengerProfile;

  beforeEach(async () => {
    const repositoryMock: RepositoryMock = {
      findOne: jest.fn<
        Promise<PassengerProfile | null>,
        [FindOneOptions<PassengerProfile>]
      >(),

      create: jest.fn(
        (input: DeepPartial<PassengerProfile>): PassengerProfile =>
          input as PassengerProfile,
      ),

      save: jest.fn((entity: PassengerProfile): Promise<PassengerProfile> =>
        Promise.resolve(entity),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassengersService,
        {
          provide: getRepositoryToken(PassengerProfile),
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<PassengersService>(PassengersService);

    repository = module.get<RepositoryMock>(
      getRepositoryToken(PassengerProfile),
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe crear el perfil', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.createMyProfile(userId, {
      firstName: 'Juan José',
      lastName: 'Torres Solano',
    });

    expect(repository.create).toHaveBeenCalledWith({
      userId,
      firstName: 'Juan José',
      lastName: 'Torres Solano',
      photoUrl: null,
      emergencyContactName: null,
      emergencyContactPhoneE164: null,
    });

    expect(repository.save).toHaveBeenCalledTimes(1);

    expect(result.userId).toBe(userId);
  });

  it('debe rechazar un segundo perfil', async () => {
    repository.findOne.mockResolvedValue(profile);

    await expect(
      service.createMyProfile(userId, {
        firstName: 'Juan José',
        lastName: 'Torres Solano',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('debe responder 404 cuando el perfil no existe', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.getMyProfile(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('debe actualizar el perfil', async () => {
    repository.findOne.mockResolvedValue({
      ...profile,
    });

    const result = await service.updateMyProfile(userId, {
      firstName: 'Juan',
    });

    expect(result.firstName).toBe('Juan');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
