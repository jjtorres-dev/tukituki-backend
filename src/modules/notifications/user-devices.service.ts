import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull, QueryFailedError } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { DeviceResponseDto } from './dto/device-response.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UserDevice } from './entities/user-device.entity';

@Injectable()
export class UserDevicesService {
  constructor(private readonly dataSource: DataSource) {}

  async register(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<DeviceResponseDto> {
    try {
      const device = await this.dataSource.transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!user) {
          throw new NotFoundException('El usuario no existe');
        }

        const repository = manager.getRepository(UserDevice);
        const now = new Date();
        const existing = await repository.findOne({
          where: { userId, deviceId: dto.deviceId.trim() },
          lock: { mode: 'pessimistic_write' },
        });

        const revokeQuery = repository
          .createQueryBuilder()
          .update(UserDevice)
          .set({ revokedAt: now })
          .where('push_token = :pushToken', {
            pushToken: dto.pushToken.trim(),
          })
          .andWhere('revoked_at IS NULL');

        if (existing) {
          revokeQuery.andWhere('id <> :existingId', {
            existingId: existing.id,
          });
        }

        await revokeQuery.execute();

        const device =
          existing ??
          repository.create({
            userId,
            deviceId: dto.deviceId.trim(),
          });
        device.platform = dto.platform;
        device.pushToken = dto.pushToken.trim();
        device.appVersion = dto.appVersion?.trim() || null;
        device.lastSeenAt = now;
        device.revokedAt = null;
        return repository.save(device);
      });

      return this.toResponse(device);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'El token push ya se encuentra activo en otro dispositivo',
        );
      }
      throw error;
    }
  }

  async revoke(userId: string, deviceId: string): Promise<void> {
    const repository = this.dataSource.getRepository(UserDevice);
    const result = await repository.update(
      { userId, deviceId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if ((result.affected ?? 0) === 0) {
      throw new NotFoundException('El dispositivo activo no existe');
    }
  }

  listActive(userId: string): Promise<UserDevice[]> {
    return this.dataSource.getRepository(UserDevice).find({
      where: { userId, revokedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });
  }

  async revokeById(deviceId: string): Promise<void> {
    await this.dataSource
      .getRepository(UserDevice)
      .update({ id: deviceId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private toResponse(device: UserDevice): DeviceResponseDto {
    return {
      id: device.id,
      platform: device.platform,
      deviceId: device.deviceId,
      appVersion: device.appVersion,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
      createdAt: device.createdAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === '23505';
  }
}
