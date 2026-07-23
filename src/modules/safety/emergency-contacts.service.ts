import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { EmergencyContactResponseDto } from './dto/emergency-contact-response.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { EmergencyContact } from './entities/emergency-contact.entity';

const MAX_CONTACTS_PER_USER = 5;

@Injectable()
export class EmergencyContactsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    userId: string,
    dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactResponseDto> {
    try {
      const contact = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(EmergencyContact);
        const count = await repository.count({ where: { userId } });
        if (count >= MAX_CONTACTS_PER_USER) {
          throw new ConflictException(
            `Solo puedes registrar ${MAX_CONTACTS_PER_USER} contactos de emergencia`,
          );
        }

        const duplicate = await repository.findOne({
          where: { userId, phoneE164: dto.phoneE164 },
        });
        if (duplicate) {
          throw new ConflictException(
            'El número ya está registrado como contacto de emergencia',
          );
        }

        const hasPrimary = await repository.exists({
          where: { userId, isPrimary: true },
        });
        const shouldBePrimary = dto.isPrimary === true || !hasPrimary;
        if (shouldBePrimary) {
          await this.clearPrimary(manager, userId);
        }

        return repository.save(
          repository.create({
            userId,
            name: dto.name.trim(),
            phoneE164: dto.phoneE164,
            relationship: dto.relationship,
            isPrimary: shouldBePrimary,
            isVerified: false,
            deletedAt: null,
          }),
        );
      });
      return this.map(contact);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'El número ya está registrado como contacto de emergencia',
        );
      }
      throw error;
    }
  }

  async list(userId: string): Promise<EmergencyContactResponseDto[]> {
    const contacts = await this.dataSource
      .getRepository(EmergencyContact)
      .find({
        where: { userId },
        order: { isPrimary: 'DESC', createdAt: 'ASC' },
      });
    return contacts.map((contact) => this.map(contact));
  }

  async update(
    userId: string,
    contactId: string,
    dto: UpdateEmergencyContactDto,
  ): Promise<EmergencyContactResponseDto> {
    const contact = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmergencyContact);
      const current = await repository.findOne({
        where: { id: contactId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('El contacto de emergencia no existe');
      }

      if (dto.phoneE164 && dto.phoneE164 !== current.phoneE164) {
        const duplicate = await repository.findOne({
          where: { userId, phoneE164: dto.phoneE164 },
        });
        if (duplicate) {
          throw new ConflictException(
            'El número ya está registrado como contacto de emergencia',
          );
        }
        current.phoneE164 = dto.phoneE164;
        current.isVerified = false;
      }
      if (dto.name !== undefined) current.name = dto.name.trim();
      if (dto.relationship !== undefined) {
        current.relationship = dto.relationship;
      }
      if (dto.isPrimary === true && !current.isPrimary) {
        await this.clearPrimary(manager, userId);
        current.isPrimary = true;
      }
      if (dto.isPrimary === false && current.isPrimary) {
        throw new ConflictException(
          'Selecciona otro contacto principal antes de quitar este',
        );
      }

      return repository.save(current);
    });
    return this.map(contact);
  }

  async setPrimary(
    userId: string,
    contactId: string,
  ): Promise<EmergencyContactResponseDto> {
    const contact = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmergencyContact);
      const current = await repository.findOne({
        where: { id: contactId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('El contacto de emergencia no existe');
      }
      await this.clearPrimary(manager, userId);
      current.isPrimary = true;
      return repository.save(current);
    });
    return this.map(contact);
  }

  async remove(userId: string, contactId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmergencyContact);
      const current = await repository.findOne({
        where: { id: contactId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('El contacto de emergencia no existe');
      }
      const wasPrimary = current.isPrimary;
      await repository.softRemove(current);
      if (wasPrimary) {
        const replacement = await repository.findOne({
          where: { userId },
          order: { createdAt: 'ASC' },
        });
        if (replacement) {
          replacement.isPrimary = true;
          await repository.save(replacement);
        }
      }
    });
  }

  private async clearPrimary(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager
      .getRepository(EmergencyContact)
      .update({ userId, isPrimary: true }, { isPrimary: false });
  }

  private map(contact: EmergencyContact): EmergencyContactResponseDto {
    return {
      id: contact.id,
      name: contact.name,
      phoneE164: contact.phoneE164,
      relationship: contact.relationship,
      isPrimary: contact.isPrimary,
      isVerified: contact.isVerified,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === '23505';
  }
}
