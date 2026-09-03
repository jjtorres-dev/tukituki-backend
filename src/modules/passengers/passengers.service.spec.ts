import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import type { DeepPartial, FindOneOptions } from 'typeorm';

import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { UpdatePassengerProfileDto } from './dto/update-passenger-profile.dto';
import { PassengerProfile } from './entities/passenger-profile.entity';
import { PassengersService } from './passengers.service';

interface AvatarResolverMock {
  resolveDriverAvatarUrl: jest.Mock;
  resolvePassengerAvatarUrl: jest.Mock;
}

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
  let avatarResolver: AvatarResolverMock;

  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const profile: PassengerProfile = {
    id: 'a73d4092-d959-4c41-846c-b3457103106f',
    userId,
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    email: null,
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

    const avatarResolverMock: AvatarResolverMock = {
      resolveDriverAvatarUrl: jest.fn(
        () => 'https://resolved.example/avatar.jpg',
      ),
      resolvePassengerAvatarUrl: jest.fn(
        () => 'https://resolved.example/avatar.jpg',
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassengersService,
        {
          provide: getRepositoryToken(PassengerProfile),
          useValue: repositoryMock,
        },
        {
          provide: AvatarUrlResolverService,
          useValue: avatarResolverMock,
        },
      ],
    }).compile();

    service = module.get<PassengersService>(PassengersService);

    repository = module.get<RepositoryMock>(
      getRepositoryToken(PassengerProfile),
    );

    avatarResolver = module.get<AvatarResolverMock>(AvatarUrlResolverService);
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
      email: null,
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

  it('createMyProfile pasa el email tal cual cuando el DTO lo trae', async () => {
    repository.findOne.mockResolvedValue(null);

    await service.createMyProfile(userId, {
      firstName: 'Juan José',
      lastName: 'Torres Solano',
      email: 'juan@example.com',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'juan@example.com' }),
    );
  });

  it('updateMyProfile actualiza el email cuando el DTO lo trae', async () => {
    repository.findOne.mockResolvedValue({ ...profile });

    const result = await service.updateMyProfile(userId, {
      email: 'nuevo@x.com',
    });

    expect(result.email).toBe('nuevo@x.com');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('updateMyProfile borra el email con un null explícito del DTO', async () => {
    repository.findOne.mockResolvedValue({
      ...profile,
      email: 'viejo@x.com',
    });

    const result = await service.updateMyProfile(userId, {
      email: null,
    } as unknown as UpdatePassengerProfileDto);

    expect(result.email).toBeNull();
  });

  it('updateMyProfile no toca el email si el DTO no trae la clave', async () => {
    repository.findOne.mockResolvedValue({
      ...profile,
      email: 'viejo@x.com',
    });

    const result = await service.updateMyProfile(userId, {
      firstName: 'Juan',
    });

    expect(result.email).toBe('viejo@x.com');
  });

  describe('STORAGE-R2: assertProfilePhotoUploadAllowed / completeProfilePhotoUpload', () => {
    it('assertProfilePhotoUploadAllowed exige que el perfil ya exista (sin restricción de estado)', async () => {
      repository.findOne.mockResolvedValue({ ...profile });

      await expect(
        service.assertProfilePhotoUploadAllowed(userId),
      ).resolves.toMatchObject({ id: profile.id });
    });

    it('assertProfilePhotoUploadAllowed lanza NotFoundException si el perfil todavía no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.assertProfilePhotoUploadAllowed(userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('completeProfilePhotoUpload persiste únicamente el objectKey (photoUrl legacy no se toca)', async () => {
      repository.findOne.mockResolvedValue({
        ...profile,
        photoUrl: 'https://cdn.tukituki.pe/legacy.jpg',
        photoObjectKey: 'passengers/profile/old.jpg',
      });

      const { profile: saved, previousObjectKey } =
        await service.completeProfilePhotoUpload(
          userId,
          'passengers/profile/new.jpg',
        );

      expect(saved.photoObjectKey).toBe('passengers/profile/new.jpg');
      expect(saved.photoUrl).toBe('https://cdn.tukituki.pe/legacy.jpg');
      expect(previousObjectKey).toBe('passengers/profile/old.jpg');
    });
  });

  describe('LEGACY: un perfil con photoUrl y sin photoObjectKey sigue siendo representable', () => {
    it('getMyProfile devuelve tal cual un perfil legacy (photoUrl set, photoObjectKey null)', async () => {
      repository.findOne.mockResolvedValue({
        ...profile,
        photoUrl: 'https://cdn.tukituki.pe/passenger.jpg',
        photoObjectKey: null,
      });

      const result = await service.getMyProfile(userId);

      expect(result.photoUrl).toBe('https://cdn.tukituki.pe/passenger.jpg');
      expect(result.photoObjectKey).toBeNull();
    });
  });

  describe('STORAGE-R2.1: toProfileResponse', () => {
    it('resuelve photoUrl a través de AvatarUrlResolverService y nunca expone photoObjectKey', () => {
      const response = service.toProfileResponse(
        {
          ...profile,
          photoObjectKey: 'passengers/profile/1.jpg',
        },
        '+51987654321',
      );

      expect(avatarResolver.resolvePassengerAvatarUrl).toHaveBeenCalledWith(
        expect.objectContaining({ photoObjectKey: 'passengers/profile/1.jpg' }),
      );
      expect(response.photoUrl).toBe('https://resolved.example/avatar.jpg');
      expect(
        Object.prototype.hasOwnProperty.call(response, 'photoObjectKey'),
      ).toBe(false);
    });

    it('devuelve phoneE164 tal cual el argumento recibido', () => {
      expect(
        service.toProfileResponse({ ...profile }, '+51987654321').phoneE164,
      ).toBe('+51987654321');
    });

    it('refleja el email de la entidad en la respuesta (incluido null)', () => {
      expect(
        service.toProfileResponse(
          { ...profile, email: 'juan@example.com' },
          '+51999999999',
        ).email,
      ).toBe('juan@example.com');

      expect(
        service.toProfileResponse({ ...profile, email: null }, '+51999999999')
          .email,
      ).toBeNull();
    });
  });
});
