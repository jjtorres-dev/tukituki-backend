import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverStatus } from './enums/driver-status.enum';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(DriverProfile)
    private readonly driverProfilesRepository: Repository<DriverProfile>,
  ) {}

  findByUserId(userId: string): Promise<DriverProfile | null> {
    return this.driverProfilesRepository.findOne({
      where: {
        userId,
      },
    });
  }

  async createMyProfile(
    userId: string,
    dto: CreateDriverProfileDto,
  ): Promise<DriverProfile> {
    const existingProfile = await this.findByUserId(userId);

    if (existingProfile) {
      throw new ConflictException(
        'Ya existe una solicitud de conductor para esta cuenta',
      );
    }

    this.assertAdult(dto.birthDate);

    const profile = this.driverProfilesRepository.create({
      userId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      birthDate: dto.birthDate,
      address: dto.address,
      photoUrl: dto.photoUrl ?? null,
      status: DriverStatus.DRAFT,
      rejectionReason: null,
      submittedAt: null,
      approvedAt: null,
      approvedByUserId: null,
    });

    try {
      return await this.driverProfilesRepository.save(profile);
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Ya existe una solicitud con este usuario o número de documento',
        );
      }

      throw error;
    }
  }

  async getMyProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException(
        'Todavía no has creado una solicitud de conductor',
      );
    }

    return profile;
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateDriverProfileDto,
  ): Promise<DriverProfile> {
    const profile = await this.getMyProfile(userId);

    this.assertEditable(profile);

    if (dto.birthDate !== undefined) {
      this.assertAdult(dto.birthDate);
      profile.birthDate = dto.birthDate;
    }

    if (dto.firstName !== undefined) {
      profile.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      profile.lastName = dto.lastName;
    }

    if (dto.documentType !== undefined) {
      profile.documentType = dto.documentType;
    }

    if (dto.documentNumber !== undefined) {
      profile.documentNumber = dto.documentNumber;
    }

    if (dto.address !== undefined) {
      profile.address = dto.address;
    }

    if (dto.photoUrl !== undefined) {
      profile.photoUrl = dto.photoUrl;
    }

    /*
     * Una solicitud rechazada vuelve a borrador
     * cuando el solicitante empieza a corregirla.
     */
    if (profile.status === DriverStatus.REJECTED) {
      profile.status = DriverStatus.DRAFT;
      profile.rejectionReason = null;
      profile.submittedAt = null;
      profile.approvedAt = null;
      profile.approvedByUserId = null;
    }

    try {
      return await this.driverProfilesRepository.save(profile);
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'El número de documento ya está registrado',
        );
      }

      throw error;
    }
  }

  async submitMyProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.getMyProfile(userId);

    if (
      profile.status !== DriverStatus.DRAFT &&
      profile.status !== DriverStatus.REJECTED
    ) {
      throw new BadRequestException(
        'La solicitud no puede enviarse a revisión en su estado actual',
      );
    }

    this.assertAdult(profile.birthDate);

    profile.status = DriverStatus.PENDING_REVIEW;

    profile.submittedAt = new Date();
    profile.rejectionReason = null;
    profile.approvedAt = null;
    profile.approvedByUserId = null;

    return this.driverProfilesRepository.save(profile);
  }

  private assertEditable(profile: DriverProfile): void {
    const editableStatuses = [DriverStatus.DRAFT, DriverStatus.REJECTED];

    if (!editableStatuses.includes(profile.status)) {
      throw new BadRequestException(
        'La solicitud no puede modificarse en su estado actual',
      );
    }
  }

  private assertAdult(birthDate: string): void {
    const birth = new Date(`${birthDate}T00:00:00.000Z`);

    if (Number.isNaN(birth.getTime())) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }

    const today = new Date();

    let age = today.getUTCFullYear() - birth.getUTCFullYear();

    const birthdayHasNotOccurred =
      today.getUTCMonth() < birth.getUTCMonth() ||
      (today.getUTCMonth() === birth.getUTCMonth() &&
        today.getUTCDate() < birth.getUTCDate());

    if (birthdayHasNotOccurred) {
      age -= 1;
    }

    if (age < 18) {
      throw new BadRequestException('El conductor debe tener al menos 18 años');
    }
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
