import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { UpdateDriverDocumentDto } from './dto/update-driver-document.dto';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverDocumentStatus } from './enums/driver-document-status.enum';
import { DriverDocumentType } from './enums/driver-document-type.enum';
import { DriverStatus } from './enums/driver-status.enum';

interface DriverDocumentData {
  type: DriverDocumentType;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}

@Injectable()
export class DriverDocumentsService {
  constructor(
    @InjectRepository(DriverDocument)
    private readonly driverDocumentsRepository: Repository<DriverDocument>,

    @InjectRepository(DriverProfile)
    private readonly driverProfilesRepository: Repository<DriverProfile>,

    @InjectRepository(DriverVehicle)
    private readonly driverVehiclesRepository: Repository<DriverVehicle>,
  ) {}

  async createMyDocument(
    userId: string,
    dto: CreateDriverDocumentDto,
  ): Promise<DriverDocument> {
    const profile = await this.getDriverProfileOrFail(userId);

    this.assertApplicationEditable(profile);

    await this.assertVehicleExists(profile.id);

    const existingDocument = await this.driverDocumentsRepository.findOne({
      where: {
        driverProfileId: profile.id,
        type: dto.type,
      },
    });

    if (existingDocument) {
      throw new ConflictException('Ya registraste este tipo de documento');
    }

    const documentData: DriverDocumentData = {
      type: dto.type,
      documentNumber: dto.documentNumber ?? null,
      issuedAt: dto.issuedAt ?? null,
      expiresAt: dto.expiresAt ?? null,
    };

    this.validateDocumentData(documentData);

    const document = this.driverDocumentsRepository.create({
      driverProfileId: profile.id,
      type: dto.type,
      fileUrl: dto.fileUrl,
      documentNumber: documentData.documentNumber,
      issuedAt: documentData.issuedAt,
      expiresAt: documentData.expiresAt,
      status: DriverDocumentStatus.DRAFT,
      rejectionReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
    });

    try {
      return await this.driverDocumentsRepository.save(document);
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya registraste este tipo de documento');
      }

      throw error;
    }
  }

  async listMyDocuments(userId: string): Promise<DriverDocument[]> {
    const profile = await this.getDriverProfileOrFail(userId);

    return this.driverDocumentsRepository.find({
      where: {
        driverProfileId: profile.id,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async getMyDocument(
    userId: string,
    documentId: string,
  ): Promise<DriverDocument> {
    const profile = await this.getDriverProfileOrFail(userId);

    const document = await this.driverDocumentsRepository.findOne({
      where: {
        id: documentId,
        driverProfileId: profile.id,
      },
    });

    if (!document) {
      throw new NotFoundException('El documento no existe');
    }

    return document;
  }

  async updateMyDocument(
    userId: string,
    documentId: string,
    dto: UpdateDriverDocumentDto,
  ): Promise<DriverDocument> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar',
      );
    }

    const profile = await this.getDriverProfileOrFail(userId);

    this.assertApplicationEditable(profile);

    const document = await this.getDocumentByProfileOrFail(
      profile.id,
      documentId,
    );

    this.assertDocumentEditable(document);

    const documentData: DriverDocumentData = {
      type: document.type,
      documentNumber: dto.documentNumber ?? document.documentNumber,
      issuedAt: dto.issuedAt ?? document.issuedAt,
      expiresAt: dto.expiresAt ?? document.expiresAt,
    };

    this.validateDocumentData(documentData);

    if (dto.fileUrl !== undefined) {
      document.fileUrl = dto.fileUrl;
    }

    if (dto.documentNumber !== undefined) {
      document.documentNumber = dto.documentNumber;
    }

    if (dto.issuedAt !== undefined) {
      document.issuedAt = dto.issuedAt;
    }

    if (dto.expiresAt !== undefined) {
      document.expiresAt = dto.expiresAt;
    }

    if (document.status === DriverDocumentStatus.REJECTED) {
      document.status = DriverDocumentStatus.DRAFT;

      document.rejectionReason = null;
      document.reviewedAt = null;
      document.reviewedByUserId = null;
    }

    return this.driverDocumentsRepository.save(document);
  }

  /*
   * STORAGE-R2: valida que el usuario pueda subir un documento
   * (perfil propio, solicitud editable, vehículo ya registrado) SIN
   * crear todavía ninguna fila. Reutilizado por modules/storage para
   * decidir el prefijo del objectKey antes de presignar.
   */
  async assertDocumentUploadAllowed(userId: string): Promise<DriverProfile> {
    const profile = await this.getDriverProfileOrFail(userId);

    this.assertApplicationEditable(profile);
    await this.assertVehicleExists(profile.id);

    return profile;
  }

  /*
   * STORAGE-R2: crea o reemplaza el documento de este tipo con un
   * objectKey ya validado (HeadObject) por modules/storage. Reutiliza
   * las mismas reglas de edición/propiedad que el flujo legacy
   * (createMyDocument/updateMyDocument) en vez de duplicarlas.
   *
   * Devuelve el objectKey anterior (si existía) para que el llamador
   * pueda borrarlo del bucket en modo best-effort DESPUÉS de que esta
   * escritura en DB haya confirmado — nunca antes.
   */
  async completeDocumentUpload(
    userId: string,
    type: DriverDocumentType,
    objectKey: string,
  ): Promise<{ document: DriverDocument; previousObjectKey: string | null }> {
    const profile = await this.assertDocumentUploadAllowed(userId);

    const existingDocument = await this.driverDocumentsRepository.findOne({
      where: {
        driverProfileId: profile.id,
        type,
      },
    });

    if (existingDocument) {
      this.assertDocumentEditable(existingDocument);

      const previousObjectKey = existingDocument.fileObjectKey;

      existingDocument.fileObjectKey = objectKey;

      if (existingDocument.status === DriverDocumentStatus.REJECTED) {
        existingDocument.status = DriverDocumentStatus.DRAFT;
        existingDocument.rejectionReason = null;
        existingDocument.reviewedAt = null;
        existingDocument.reviewedByUserId = null;
      }

      const document =
        await this.driverDocumentsRepository.save(existingDocument);

      return { document, previousObjectKey };
    }

    const document = this.driverDocumentsRepository.create({
      driverProfileId: profile.id,
      type,
      fileUrl: null,
      fileObjectKey: objectKey,
      documentNumber: null,
      issuedAt: null,
      expiresAt: null,
      status: DriverDocumentStatus.DRAFT,
      rejectionReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
    });

    try {
      const saved = await this.driverDocumentsRepository.save(document);

      return { document: saved, previousObjectKey: null };
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya registraste este tipo de documento');
      }

      throw error;
    }
  }

  /*
   * STORAGE-R2: usado por el endpoint de descarga privada del propio
   * conductor. Reutiliza getDocumentByProfileOrFail para no duplicar
   * la verificación de propiedad.
   */
  async getMyDocumentForDownload(
    userId: string,
    documentId: string,
  ): Promise<DriverDocument> {
    const profile = await this.getDriverProfileOrFail(userId);

    return this.getDocumentByProfileOrFail(profile.id, documentId);
  }

  async deleteMyDocument(userId: string, documentId: string): Promise<void> {
    const profile = await this.getDriverProfileOrFail(userId);

    this.assertApplicationEditable(profile);

    const document = await this.getDocumentByProfileOrFail(
      profile.id,
      documentId,
    );

    this.assertDocumentEditable(document);

    await this.driverDocumentsRepository.remove(document);
  }

  private async getDriverProfileOrFail(userId: string): Promise<DriverProfile> {
    const profile = await this.driverProfilesRepository.findOne({
      where: {
        userId,
      },
    });

    if (!profile) {
      throw new NotFoundException(
        'Primero debes crear tu solicitud de conductor',
      );
    }

    return profile;
  }

  private async assertVehicleExists(driverProfileId: string): Promise<void> {
    const vehicle = await this.driverVehiclesRepository.findOne({
      select: {
        id: true,
      },
      where: {
        driverProfileId,
      },
    });

    if (!vehicle) {
      throw new BadRequestException(
        'Primero debes registrar el vehículo del conductor',
      );
    }
  }

  private async getDocumentByProfileOrFail(
    driverProfileId: string,
    documentId: string,
  ): Promise<DriverDocument> {
    const document = await this.driverDocumentsRepository.findOne({
      where: {
        id: documentId,
        driverProfileId,
      },
    });

    if (!document) {
      throw new NotFoundException('El documento no existe');
    }

    return document;
  }

  private assertApplicationEditable(profile: DriverProfile): void {
    const editableStatuses = [DriverStatus.DRAFT, DriverStatus.REJECTED];

    if (!editableStatuses.includes(profile.status)) {
      throw new BadRequestException(
        'Los documentos no pueden modificarse en el estado actual de la solicitud',
      );
    }
  }

  private assertDocumentEditable(document: DriverDocument): void {
    const editableStatuses = [
      DriverDocumentStatus.DRAFT,
      DriverDocumentStatus.REJECTED,
    ];

    if (!editableStatuses.includes(document.status)) {
      throw new BadRequestException(
        'El documento no puede modificarse en su estado actual',
      );
    }
  }

  private validateDocumentData(data: DriverDocumentData): void {
    const issuedDate = data.issuedAt
      ? this.parseDate(data.issuedAt, 'La fecha de emisión no es válida')
      : null;

    const expiresDate = data.expiresAt
      ? this.parseDate(data.expiresAt, 'La fecha de vencimiento no es válida')
      : null;

    const today = this.getTodayUtc();

    if (issuedDate && issuedDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'La fecha de emisión no puede estar en el futuro',
      );
    }

    if (
      issuedDate &&
      expiresDate &&
      expiresDate.getTime() <= issuedDate.getTime()
    ) {
      throw new BadRequestException(
        'La fecha de vencimiento debe ser posterior a la fecha de emisión',
      );
    }

    switch (data.type) {
      case DriverDocumentType.DRIVER_LICENSE:
      case DriverDocumentType.SOAT:
        this.assertRequiredFields(data, [
          'documentNumber',
          'issuedAt',
          'expiresAt',
        ]);

        if (expiresDate && expiresDate.getTime() < today.getTime()) {
          throw new BadRequestException('El documento se encuentra vencido');
        }

        break;

      case DriverDocumentType.VEHICLE_REGISTRATION:
        this.assertRequiredFields(data, ['documentNumber', 'issuedAt']);

        break;

      case DriverDocumentType.DNI_FRONT:
      case DriverDocumentType.DNI_BACK:
      case DriverDocumentType.PROFILE_PHOTO:
        break;

      default:
        throw new BadRequestException('El tipo de documento no es válido');
    }
  }

  private assertRequiredFields(
    data: DriverDocumentData,
    fields: Array<'documentNumber' | 'issuedAt' | 'expiresAt'>,
  ): void {
    const missingFields = fields.filter((field) => !data[field]);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Faltan datos obligatorios para este documento: ${missingFields.join(', ')}`,
      );
    }
  }

  private parseDate(value: string, errorMessage: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);

    const normalizedDate = Number.isNaN(date.getTime())
      ? null
      : date.toISOString().slice(0, 10);

    if (normalizedDate !== value) {
      throw new BadRequestException(errorMessage);
    }

    return date;
  }

  private getTodayUtc(): Date {
    const now = new Date();

    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };

    return (
      driverError.code === '23505' &&
      driverError.constraint === 'UQ_driver_documents_profile_type'
    );
  }
}
