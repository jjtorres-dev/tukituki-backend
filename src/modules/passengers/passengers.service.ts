import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { CreatePassengerProfileDto } from './dto/create-passenger-profile.dto';
import { UpdatePassengerProfileDto } from './dto/update-passenger-profile.dto';
import { PassengerProfile } from './entities/passenger-profile.entity';

@Injectable()
export class PassengersService {
  constructor(
    @InjectRepository(PassengerProfile)
    private readonly passengerProfilesRepository: Repository<PassengerProfile>,
  ) {}

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
   * STORAGE-R2: persiste el objectKey ya validado (HeadObject) y la
   * URL estable resuelta por modules/storage. Devuelve el objectKey
   * anterior para que el llamador lo borre del bucket en modo
   * best-effort después de que esta escritura confirme.
   */
  async completeProfilePhotoUpload(
    userId: string,
    objectKey: string,
    resolvedPhotoUrl: string,
  ): Promise<{ profile: PassengerProfile; previousObjectKey: string | null }> {
    const profile = await this.assertProfilePhotoUploadAllowed(userId);

    const previousObjectKey = profile.photoObjectKey;

    profile.photoObjectKey = objectKey;
    profile.photoUrl = resolvedPhotoUrl;

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
