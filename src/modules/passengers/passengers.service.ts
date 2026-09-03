import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { CreatePassengerProfileDto } from './dto/create-passenger-profile.dto';
import { PassengerProfileResponseDto } from './dto/passenger-profile-response.dto';
import { UpdatePassengerProfileDto } from './dto/update-passenger-profile.dto';
import { PassengerProfile } from './entities/passenger-profile.entity';

@Injectable()
export class PassengersService {
  constructor(
    @InjectRepository(PassengerProfile)
    private readonly passengerProfilesRepository: Repository<PassengerProfile>,

    private readonly avatarResolver: AvatarUrlResolverService,
  ) {}

  /*
   * STORAGE-R2.1: única forma de exponer el perfil del pasajero hacia
   * afuera. Nunca devolver la entidad ni photoObjectKey directamente.
   */
  toProfileResponse(
    profile: PassengerProfile,
    phoneE164: string,
  ): PassengerProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phoneE164,
      photoUrl: this.avatarResolver.resolvePassengerAvatarUrl(profile),
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhoneE164: profile.emergencyContactPhoneE164,
      ratingAverage: profile.ratingAverage,
      ratingCount: profile.ratingCount,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  findByUserId(userId: string): Promise<PassengerProfile | null> {
    return this.passengerProfilesRepository.findOne({
      where: {
        userId,
      },
    });
  }

  async createMyProfile(
    userId: string,
    dto: CreatePassengerProfileDto,
  ): Promise<PassengerProfile> {
    const existingProfile = await this.findByUserId(userId);

    if (existingProfile) {
      throw new ConflictException('El pasajero ya tiene un perfil registrado');
    }

    const profile = this.passengerProfilesRepository.create({
      userId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email ?? null,
      photoUrl: dto.photoUrl ?? null,
      emergencyContactName: dto.emergencyContactName ?? null,
      emergencyContactPhoneE164: dto.emergencyContactPhoneE164 ?? null,
    });

    try {
      return await this.passengerProfilesRepository.save(profile);
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'El pasajero ya tiene un perfil registrado',
        );
      }

      throw error;
    }
  }

  async getMyProfile(userId: string): Promise<PassengerProfile> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException(
        'El perfil del pasajero todavía no ha sido creado',
      );
    }

    return profile;
  }

  async updateMyProfile(
    userId: string,
    dto: UpdatePassengerProfileDto,
  ): Promise<PassengerProfile> {
    const profile = await this.getMyProfile(userId);

    if (dto.firstName !== undefined) {
      profile.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      profile.lastName = dto.lastName;
    }

    if (dto.email !== undefined) {
      profile.email = dto.email;
    }

    if (dto.photoUrl !== undefined) {
      profile.photoUrl = dto.photoUrl;
    }

    if (dto.emergencyContactName !== undefined) {
      profile.emergencyContactName = dto.emergencyContactName;
    }

    if (dto.emergencyContactPhoneE164 !== undefined) {
      profile.emergencyContactPhoneE164 = dto.emergencyContactPhoneE164;
    }

    return this.passengerProfilesRepository.save(profile);
  }

  /*
   * STORAGE-R2: valida que el usuario pueda subir su foto de perfil
   * (perfil propio ya creado). El perfil de pasajero no tiene un
   * estado que bloquee edición (a diferencia de DriverProfile), por
   * eso no hay una comprobación adicional además de la propiedad.
   */
  assertProfilePhotoUploadAllowed(userId: string): Promise<PassengerProfile> {
    return this.getMyProfile(userId);
  }

  /*
   * STORAGE-R2.1: persiste únicamente el objectKey ya validado
   * (HeadObject). Ya NO se escribe una URL resuelta en photoUrl (ver
   * el mismo comentario en DriversService.completeProfilePhotoUpload).
   */
  async completeProfilePhotoUpload(
    userId: string,
    objectKey: string,
  ): Promise<{ profile: PassengerProfile; previousObjectKey: string | null }> {
    const profile = await this.assertProfilePhotoUploadAllowed(userId);

    const previousObjectKey = profile.photoObjectKey;

    profile.photoObjectKey = objectKey;

    const saved = await this.passengerProfilesRepository.save(profile);

    return { profile: saved, previousObjectKey };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: string;
    };

    return driverError.code === '23505';
  }
}
