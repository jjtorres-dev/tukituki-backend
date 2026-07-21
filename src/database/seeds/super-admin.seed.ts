import 'reflect-metadata';
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import type { Repository } from 'typeorm';

import { AppModule } from '../../app.module';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { UserStatus } from '../../modules/users/enums/user-status.enum';

const logger = new Logger('SuperAdminSeed');

async function run(): Promise<void> {
  const phoneE164 = process.env.SUPER_ADMIN_PHONE_E164;

  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!phoneE164 || !/^\+519\d{8}$/.test(phoneE164)) {
    throw new Error(
      'SUPER_ADMIN_PHONE_E164 debe tener el formato +519XXXXXXXX',
    );
  }

  if (!password || password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD debe tener al menos 12 caracteres');
  }

  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const usersRepository = application.get<Repository<User>>(
      getRepositoryToken(User),
    );

    let user = await usersRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('user.phone_e164 = :phoneE164', {
        phoneE164,
      })
      .getOne();

    const passwordHash = await hash(password, 12);

    if (!user) {
      user = usersRepository.create({
        phoneE164,
        passwordHash,
        roles: [UserRole.SUPER_ADMIN],
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        lastLoginAt: null,
        deletedAt: null,
      });

      await usersRepository.save(user);

      logger.log(`SUPER_ADMIN creado: ${phoneE164}`);

      return;
    }

    user.passwordHash = passwordHash;

    user.roles = Array.from(new Set([...user.roles, UserRole.SUPER_ADMIN]));

    user.status = UserStatus.ACTIVE;

    user.isPhoneVerified = true;
    user.deletedAt = null;

    await usersRepository.save(user);

    logger.log(`SUPER_ADMIN actualizado: ${phoneE164}`);
  } finally {
    await application.close();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido';

  logger.error(message);
  process.exitCode = 1;
});
