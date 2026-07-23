import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  TooManyRequestsException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { PassengerRideStartCodeResponseDto } from './dto/passenger-ride-start-code-response.dto';
import { RideStartCode } from './entities/ride-start-code.entity';
import { Ride } from './entities/ride.entity';
import { RideStartCodeStatus } from './enums/ride-start-code-status.enum';
import { RideStatus } from './enums/ride-status.enum';

const DEFAULT_START_CODE_TTL_SECONDS = 15 * 60;
const DEFAULT_START_CODE_MAX_ATTEMPTS = 5;
const DEFAULT_START_CODE_MAX_REGENERATIONS = 3;
const START_CODE_DIGITS = 4;
const START_CODE_MODULUS = 10_000;
const NONCE_BYTES = 32;
const MINIMUM_SECRET_LENGTH = 32;
const HTTP_STATUS_LOCKED = 423;

interface PassengerCodeOutcome {
  startCode: RideStartCode;
  observedAt: Date;
}

@Injectable()
export class RideStartCodesService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly maximumAttempts: number;
  private readonly maximumRegenerations: number;

  constructor(
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    const configuredSecret = configService
      .get<string>('RIDE_START_CODE_SECRET')
      ?.trim();

    if (!configuredSecret || configuredSecret.length < MINIMUM_SECRET_LENGTH) {
      throw new Error(
        `RIDE_START_CODE_SECRET debe existir y tener al menos ${MINIMUM_SECRET_LENGTH} caracteres`,
      );
    }

    this.secret = configuredSecret;
    this.ttlSeconds = this.readPositiveInteger(
      configService,
      'RIDE_START_CODE_TTL_SECONDS',
      DEFAULT_START_CODE_TTL_SECONDS,
    );
    this.maximumAttempts = this.readPositiveInteger(
      configService,
      'RIDE_START_CODE_MAX_ATTEMPTS',
      DEFAULT_START_CODE_MAX_ATTEMPTS,
    );
    this.maximumRegenerations = this.readPositiveInteger(
      configService,
      'RIDE_START_CODE_MAX_REGENERATIONS',
      DEFAULT_START_CODE_MAX_REGENERATIONS,
    );
  }

  async getPassengerStartCode(
    passengerUserId: string,
    rideId: string,
  ): Promise<PassengerRideStartCodeResponseDto> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<PassengerCodeOutcome> => {
        const ride = await this.lockPassengerRide(
          manager,
          passengerUserId,
          rideId,
        );
        this.assertRideAwaitingStart(ride);

        const observedAt = new Date();
        const startCode = await this.createForArrivedRideWithinTransaction(
          manager,
          ride,
          observedAt,
        );

        if (
          startCode.status === RideStartCodeStatus.ACTIVE &&
          startCode.expiresAt.getTime() <= observedAt.getTime()
        ) {
          startCode.status = RideStartCodeStatus.EXPIRED;
          await manager.getRepository(RideStartCode).save(startCode);
        }

        return { startCode, observedAt };
      },
    );

    this.assertCodeCanBeDisplayed(outcome.startCode);

    return this.mapPassengerResponse(outcome.startCode, outcome.observedAt);
  }

  async regeneratePassengerStartCode(
    passengerUserId: string,
    rideId: string,
  ): Promise<PassengerRideStartCodeResponseDto> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<PassengerCodeOutcome> => {
        const ride = await this.lockPassengerRide(
          manager,
          passengerUserId,
          rideId,
        );
        this.assertRideAwaitingStart(ride);

        const now = new Date();
        const startCode = await this.createForArrivedRideWithinTransaction(
          manager,
          ride,
          now,
        );

        if (
          startCode.status === RideStartCodeStatus.USED ||
          startCode.status === RideStartCodeStatus.CANCELLED
        ) {
          throw new ConflictException(
            'El código de inicio ya no puede regenerarse',
          );
        }

        if (startCode.regenerationCount >= startCode.maximumRegenerations) {
          throw new TooManyRequestsException(
            'Se alcanzó el máximo de regeneraciones del código de inicio',
          );
        }

        const previousCode = this.deriveCode(startCode);
        startCode.nonce = this.generateReplacementNonce(
          startCode.rideId,
          previousCode,
        );
        startCode.status = RideStartCodeStatus.ACTIVE;
        startCode.failedAttempts = 0;
        startCode.regenerationCount += 1;
        startCode.expiresAt = this.expirationFrom(now);
        startCode.usedAt = null;
        startCode.lockedAt = null;
        startCode.cancelledAt = null;
        startCode.regeneratedAt = now;

        await manager.getRepository(RideStartCode).save(startCode);

        return { startCode, observedAt: now };
      },
    );

    return this.mapPassengerResponse(outcome.startCode, outcome.observedAt);
  }

  async createForArrivedRideWithinTransaction(
    manager: EntityManager,
    ride: Ride,
    occurredAt: Date,
  ): Promise<RideStartCode> {
    if (ride.status !== RideStatus.DRIVER_ARRIVED) {
      throw new ConflictException(
        'El código de inicio solo puede generarse cuando el conductor llegó',
      );
    }

    const repository = manager.getRepository(RideStartCode);
    const existing = await this.lockByRideId(repository, ride.id);

    if (existing) {
      return existing;
    }

    const startCode = repository.create({
      rideId: ride.id,
      nonce: this.generateNonce(),
      status: RideStartCodeStatus.ACTIVE,
      failedAttempts: 0,
      maximumAttempts: this.maximumAttempts,
      regenerationCount: 0,
      maximumRegenerations: this.maximumRegenerations,
      expiresAt: this.expirationFrom(occurredAt),
      usedAt: null,
      lockedAt: null,
      regeneratedAt: null,
      cancelledAt: null,
    });

    return repository.save(startCode);
  }

  async cancelForRideWithinTransaction(
    manager: EntityManager,
    rideId: string,
    cancelledAt: Date,
  ): Promise<void> {
    const repository = manager.getRepository(RideStartCode);
    const startCode = await this.lockByRideId(repository, rideId);

    if (
      !startCode ||
      startCode.status === RideStartCodeStatus.USED ||
      startCode.status === RideStartCodeStatus.CANCELLED
    ) {
      return;
    }

    startCode.status = RideStartCodeStatus.CANCELLED;
    startCode.cancelledAt = cancelledAt;
    await repository.save(startCode);
  }

  deriveCode(startCode: Pick<RideStartCode, 'rideId' | 'nonce'>): string {
    const digest = createHmac('sha256', this.secret)
      .update(`${startCode.rideId}:${startCode.nonce}`, 'utf8')
      .digest();
    const numericCode = digest.readUInt32BE(0) % START_CODE_MODULUS;

    return numericCode.toString().padStart(START_CODE_DIGITS, '0');
  }

  matchesCode(providedCode: string, expectedCode: string): boolean {
    const provided = Buffer.from(providedCode, 'utf8');
    const expected = Buffer.from(expectedCode, 'utf8');

    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  }

  private async lockPassengerRide(
    manager: EntityManager,
    passengerUserId: string,
    rideId: string,
  ): Promise<Ride> {
    const ride = await manager.getRepository(Ride).findOne({
      where: { id: rideId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!ride || ride.passengerUserId !== passengerUserId) {
      throw new NotFoundException('El viaje no existe');
    }

    return ride;
  }

  private assertRideAwaitingStart(ride: Ride): void {
    if (ride.status !== RideStatus.DRIVER_ARRIVED) {
      throw new ConflictException(
        'El código solo está disponible cuando el conductor llegó',
      );
    }
  }

  private assertCodeCanBeDisplayed(startCode: RideStartCode): void {
    if (startCode.status === RideStartCodeStatus.EXPIRED) {
      throw new GoneException('El código de inicio venció; genera uno nuevo');
    }

    if (startCode.status === RideStartCodeStatus.LOCKED) {
      throw new HttpException(
        {
          statusCode: HTTP_STATUS_LOCKED,
          message: 'El código está bloqueado; el pasajero debe regenerarlo',
          error: 'Locked',
        },
        HTTP_STATUS_LOCKED,
      );
    }

    if (startCode.status !== RideStartCodeStatus.ACTIVE) {
      throw new ConflictException(
        'El código de inicio ya no se encuentra disponible',
      );
    }
  }

  private mapPassengerResponse(
    startCode: RideStartCode,
    observedAt: Date,
  ): PassengerRideStartCodeResponseDto {
    return {
      rideId: startCode.rideId,
      code: this.deriveCode(startCode),
      status: startCode.status,
      expiresAt: startCode.expiresAt,
      remainingSeconds: Math.max(
        0,
        Math.ceil(
          (startCode.expiresAt.getTime() - observedAt.getTime()) / 1000,
        ),
      ),
      failedAttempts: startCode.failedAttempts,
      remainingAttempts: Math.max(
        0,
        startCode.maximumAttempts - startCode.failedAttempts,
      ),
      regenerationCount: startCode.regenerationCount,
      remainingRegenerations: Math.max(
        0,
        startCode.maximumRegenerations - startCode.regenerationCount,
      ),
    };
  }

  private lockByRideId(
    repository: Repository<RideStartCode>,
    rideId: string,
  ): Promise<RideStartCode | null> {
    return repository.findOne({
      where: { rideId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private expirationFrom(date: Date): Date {
    return new Date(date.getTime() + this.ttlSeconds * 1000);
  }

  private generateNonce(): string {
    return randomBytes(NONCE_BYTES).toString('base64url');
  }

  private generateReplacementNonce(
    rideId: string,
    previousCode: string,
  ): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const nonce = this.generateNonce();
      const candidateCode = this.deriveCode({ rideId, nonce });

      if (candidateCode !== previousCode) {
        return nonce;
      }
    }

    throw new Error('No fue posible generar un código de inicio diferente');
  }

  private readPositiveInteger(
    configService: ConfigService,
    name: string,
    fallback: number,
  ): number {
    const configured = configService.get<string | number>(name);

    if (configured === undefined || configured === null || configured === '') {
      return fallback;
    }

    const value =
      typeof configured === 'number' ? configured : Number(configured);

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} debe ser un número entero positivo`);
    }

    return value;
  }
}
