import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { DriverProfileResponseDto } from './dto/driver-profile-response.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverStatus } from './enums/driver-status.enum';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(DriverProfile)
    private readonly driverProfilesRepository: Repository<DriverProfile>,

    private readonly avatarResolver: AvatarUrlResolverService,
  ) {}

  /*
   * STORAGE-R2.1: única forma de exponer el perfil del conductor hacia
   * afuera. Nunca devolver la entidad ni photoObjectKey directamente:
   * photoUrl se resuelve aquí (capability token si hay Storage,
   * legacy si no).
   */
  toProfileResponse(profile: DriverProfile): DriverProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      documentType: profile.documentType,
      documentNumber: profile.documentNumber,
      birthDate: profile.birthDate,
      address: profile.address,
      email: profile.email,
      photoUrl: this.avatarResolver.resolveDriverAvatarUrl(profile),
      ratingAverage: profile.ratingAverage,
      ratingCount: profile.ratingCount,
      status: profile.status,
      rejectionReason: profile.rejectionReason,
      submittedAt: profile.submittedAt,
      approvedAt: profile.approvedAt,
      approvedByUserId: profile.approvedByUserId,
      suspensionReason: profile.suspensionReason,
      suspendedAt: profile.suspendedAt,
      suspendedByUserId: profile.suspendedByUserId,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

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
      address: dto.address ?? null,
      email: dto.email ?? null,
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

    if (dto.email !== undefined) {
      profile.email = dto.email;
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

  /*
   * STORAGE-R2: valida que el usuario pueda subir su foto de perfil
   * (perfil propio ya creado, solicitud editable) sin persistir
   * todavía nada. Reutilizado por modules/storage antes de presignar.
   */
  async assertProfilePhotoUploadAllowed(
    userId: string,
  ): Promise<DriverProfile> {
    const profile = await this.getMyProfile(userId);

    this.assertEditable(profile);

    return profile;
  }

  /*
   * STORAGE-R2.1: persiste únicamente el objectKey ya validado
   * (HeadObject). Ya NO se escribe una URL resuelta en photoUrl: una
   * URL estática y persistida no puede llevar un capability token
   * fresco por request/contexto — photoUrl se resuelve al vuelo en
   * cada lectura (ver toProfileResponse y AvatarUrlResolverService).
   * Devuelve el objectKey anterior para que el llamador lo borre del
   * bucket en modo best-effort después de que esta escritura confirme.
   */
  async completeProfilePhotoUpload(
    userId: string,
    objectKey: string,
  ): Promise<{ profile: DriverProfile; previousObjectKey: string | null }> {
    const profile = await this.assertProfilePhotoUploadAllowed(userId);

    const previousObjectKey = profile.photoObjectKey;

    profile.photoObjectKey = objectKey;

    const saved = await this.driverProfilesRepository.save(profile);

    return { profile: saved, previousObjectKey };
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
