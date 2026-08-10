import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { User } from './entities/user.entity';
import { CreateUserInput } from './interfaces/create-user.interface';
import { UserStatus } from './enums/user-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  findByPhoneE164(phoneE164: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { phoneE164 },
    });
  }

  /**
   * passwordHash tiene select: false, por lo que debe
   * solicitarse explícitamente durante el inicio de sesión.
   */
  findByPhoneE164WithPassword(phoneE164: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.phoneE164 = :phoneE164', {
        phoneE164,
      })
      .getOne();
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.usersRepository.create({
      phoneE164: input.phoneE164,
      passwordHash: input.passwordHash ?? null,
      roles: input.roles,
      status: input.status ?? UserStatus.PENDING,
      isPhoneVerified: input.isPhoneVerified ?? false,
      lastLoginAt: null,
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Ya existe una cuenta registrada con este teléfono',
        );
      }

      throw error;
    }
  }

  async activatePhone(phoneE164: string): Promise<User> {
    const user = await this.findByPhoneE164(phoneE164);

    if (!user) {
      throw new NotFoundException(
        'No existe una cuenta registrada con este teléfono',
      );
    }

    user.isPhoneVerified = true;

    return this.usersRepository.save(user);
  }

  async markLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update(
      {
        id: userId,
      },
      {
        lastLoginAt: new Date(),
      },
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: string;
    };

    // Código PostgreSQL para unique_violation.
    return driverError.code === '23505';
  }
}
