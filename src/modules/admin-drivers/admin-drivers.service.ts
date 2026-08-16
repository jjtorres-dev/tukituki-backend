import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DriverDocumentResponseDto } from '../drivers/dto/driver-document-response.dto';
import { DriverProfileResponseDto } from '../drivers/dto/driver-profile-response.dto';
import { DriverVehicleResponseDto } from '../drivers/dto/driver-vehicle-response.dto';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { AdminDriverDetailResponseDto } from './dto/admin-driver-detail-response.dto';
import {
  AdminDriverListItemDto,
  AdminDriverListResponseDto,
} from './dto/admin-driver-list-response.dto';
import { AdminDriverQueryDto } from './dto/admin-driver-query.dto';

interface AdminDriverListRaw {
  id: string;
  userId: string;
  phoneE164: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  status: DriverStatus;
  submittedAt: Date | string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
}

@Injectable()
export class AdminDriversService {
  constructor(
    @InjectRepository(DriverProfile)
    private readonly driverProfilesRepository: Repository<DriverProfile>,

    @InjectRepository(DriverVehicle)
    private readonly driverVehiclesRepository: Repository<DriverVehicle>,

    @InjectRepository(DriverDocument)
    private readonly driverDocumentsRepository: Repository<DriverDocument>,

    private readonly avatarResolver: AvatarUrlResolverService,
  ) {}

  async list(query: AdminDriverQueryDto): Promise<AdminDriverListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.driverProfilesRepository
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .leftJoin(
        DriverVehicle,
        'vehicle',
        'vehicle.driver_profile_id = profile.id',
      )
      .select([
        'profile.id AS "id"',
        'profile.user_id AS "userId"',
        'user.phone_e164 AS "phoneE164"',
        'profile.first_name AS "firstName"',
        'profile.last_name AS "lastName"',
        'profile.document_number AS "documentNumber"',
        'profile.status AS "status"',
        'profile.submitted_at AS "submittedAt"',
        'vehicle.plate AS "vehiclePlate"',
        'vehicle.brand AS "vehicleBrand"',
        'vehicle.model AS "vehicleModel"',
      ]);

    if (query.status !== undefined) {
      queryBuilder.andWhere('profile.status = :status', {
        status: query.status,
      });
    }

    if (query.documentNumber) {
      queryBuilder.andWhere('profile.document_number ILIKE :documentNumber', {
        documentNumber: `%${query.documentNumber.trim()}%`,
      });
    }

    if (query.plate) {
      queryBuilder.andWhere('vehicle.plate ILIKE :plate', {
        plate: `%${query.plate.trim()}%`,
      });
    }

    if (query.phoneE164) {
      queryBuilder.andWhere('user.phone_e164 = :phoneE164', {
        phoneE164: query.phoneE164,
      });
    }

    if (query.submittedFrom) {
      queryBuilder.andWhere('profile.submitted_at >= :submittedFrom', {
        submittedFrom: this.startOfUtcDate(query.submittedFrom),
      });
    }

    if (query.submittedTo) {
      queryBuilder.andWhere('profile.submitted_at < :submittedTo', {
        submittedTo: this.startOfNextUtcDate(query.submittedTo),
      });
    }

    queryBuilder
      .orderBy('profile.submitted_at', 'DESC', 'NULLS LAST')
      .addOrderBy('profile.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const total = await queryBuilder.clone().getCount();

    const rawItems = await queryBuilder.getRawMany<AdminDriverListRaw>();

    const items: AdminDriverListItemDto[] = rawItems.map((item) => ({
      id: item.id,
      userId: item.userId,
      phoneE164: item.phoneE164,
      firstName: item.firstName,
      lastName: item.lastName,
      documentNumber: item.documentNumber,
      status: item.status,
      submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
      vehicle:
        item.vehiclePlate && item.vehicleBrand && item.vehicleModel
          ? {
              plate: item.vehiclePlate,
              brand: item.vehicleBrand,
              model: item.vehicleModel,
            }
          : null,
    }));

    return {
      items,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getDetail(
    driverProfileId: string,
  ): Promise<AdminDriverDetailResponseDto> {
    const profile = await this.driverProfilesRepository.findOne({
      where: {
        id: driverProfileId,
      },
      relations: {
        user: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('La solicitud de conductor no existe');
    }

    const [vehicle, documents] = await Promise.all([
      this.driverVehiclesRepository.findOne({
        where: {
          driverProfileId: profile.id,
        },
      }),

      this.driverDocumentsRepository.find({
        where: {
          driverProfileId: profile.id,
        },
        order: {
          type: 'ASC',
        },
      }),
    ]);

    return {
      user: {
        id: profile.user.id,
        phoneE164: profile.user.phoneE164,
        roles: profile.user.roles,
        status: profile.user.status,
        isPhoneVerified: profile.user.isPhoneVerified,
        createdAt: profile.user.createdAt,
      },

      profile: this.mapProfile(profile),

      vehicle: vehicle ? this.mapVehicle(vehicle) : null,

      documents: documents.map((document) => this.mapDocument(document)),
    };
  }

  private mapProfile(profile: DriverProfile): DriverProfileResponseDto {
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

  private mapVehicle(vehicle: DriverVehicle): DriverVehicleResponseDto {
    return {
      id: vehicle.id,
      driverProfileId: vehicle.driverProfileId,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      engineNumber: vehicle.engineNumber,
      chassisNumber: vehicle.chassisNumber,
      ownership: vehicle.ownership,
      vehicleType: vehicle.vehicleType,
      status: vehicle.status,
      rejectionReason: vehicle.rejectionReason,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
  }

  private mapDocument(document: DriverDocument): DriverDocumentResponseDto {
    return {
      id: document.id,
      driverProfileId: document.driverProfileId,
      type: document.type,
      fileUrl: document.fileUrl,
      fileObjectKey: document.fileObjectKey,
      documentNumber: document.documentNumber,
      issuedAt: document.issuedAt,
      expiresAt: document.expiresAt,
      status: document.status,
      rejectionReason: document.rejectionReason,
      reviewedAt: document.reviewedAt,
      reviewedByUserId: document.reviewedByUserId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private startOfUtcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private startOfNextUtcDate(value: string): Date {
    const date = this.startOfUtcDate(value);

    date.setUTCDate(date.getUTCDate() + 1);

    return date;
  }
}
