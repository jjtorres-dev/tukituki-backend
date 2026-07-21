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
