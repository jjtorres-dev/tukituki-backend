import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';

import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatusActor } from '../rides/enums/ride-status-actor.enum';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { RideRealtimeService } from '../rides/realtime/ride-realtime.service';
import { AdminSafetyIncidentQueryDto } from './dto/admin-safety-incident-query.dto';
import { CreateSafetyIncidentDto } from './dto/create-safety-incident.dto';
import { ResolveSafetyIncidentDto } from './dto/resolve-safety-incident.dto';
import {
  SafetyIncidentListResponseDto,
  SafetyIncidentResponseDto,
} from './dto/safety-incident-response.dto';
import { RideSafetyIncident } from './entities/ride-safety-incident.entity';
import type { SafetyIncidentPoint } from './entities/ride-safety-incident.entity';
import { SafetyIncidentSeverity } from './enums/safety-incident-severity.enum';
import { SafetyIncidentStatus } from './enums/safety-incident-status.enum';
import { SafetyIncidentType } from './enums/safety-incident-type.enum';

const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.SEARCHING_DRIVER,
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

interface DistanceResult {
  distanceMeters: string | number;
}

@Injectable()
export class RideSafetyService {
  private readonly recentRideGraceSeconds: number;
  private readonly maxLocationDistanceMeters: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly realtimeService: RideRealtimeService,
  ) {
    this.recentRideGraceSeconds = this.configService.get<number>(
      'SAFETY_INCIDENT_RECENT_RIDE_GRACE_SECONDS',
      3600,
    );
    this.maxLocationDistanceMeters = this.configService.get<number>(
      'SAFETY_LOCATION_MAX_DISTANCE_METERS',
      20000,
    );
  }

  async createIncident(
    reporterUserId: string,
    rideId: string,
    dto: CreateSafetyIncidentDto,
  ): Promise<SafetyIncidentResponseDto> {
    const incident = await this.dataSource.transaction(async (manager) => {
      const ride = await this.loadRideForUpdate(manager, rideId);
      const reporterRole = this.assertParticipant(ride, reporterUserId);
      this.assertRideAllowsIncident(ride);
      await this.assertLocationIsPlausible(
        manager,
        ride.id,
        dto.latitude,
        dto.longitude,
      );
      await this.assertNoAccidentalDuplicate(manager, ride.id, reporterUserId);

      const [passengerProfile, vehicle] = await Promise.all([
        manager.getRepository(PassengerProfile).findOne({
          where: { userId: ride.passengerUserId },
        }),
        ride.driverProfileId
          ? manager.getRepository(DriverVehicle).findOne({
              where: { driverProfileId: ride.driverProfileId },
            })
          : Promise.resolve(null),
      ]);

      const position: SafetyIncidentPoint = {
        type: 'Point',
        coordinates: [dto.longitude, dto.latitude],
      };
      const repository = manager.getRepository(RideSafetyIncident);
      const created = repository.create({
        rideId: ride.id,
        reporterUserId,
        reporterRole,
        incidentType: dto.incidentType,
        severity: this.severityFor(dto.incidentType),
        status: SafetyIncidentStatus.OPEN,
        position,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        description: dto.description?.trim() || null,
        rideStatusSnapshot: ride.status,
        passengerSnapshot: {
          userId: ride.passengerUserId,
          firstName: passengerProfile?.firstName ?? null,
          lastName: passengerProfile?.lastName ?? null,
          photoUrl: passengerProfile?.photoUrl ?? null,
        },
        driverSnapshot: ride.driverProfile
          ? {
              profileId: ride.driverProfile.id,
              userId: ride.driverProfile.userId,
              firstName: ride.driverProfile.firstName,
              lastName: ride.driverProfile.lastName,
              photoUrl: ride.driverProfile.photoUrl,
            }
          : null,
        vehicleSnapshot: vehicle
          ? {
              plate: vehicle.plate,
              brand: vehicle.brand,
              model: vehicle.model,
              color: vehicle.color,
              vehicleType: vehicle.vehicleType,
            }
          : null,
        acknowledgedByUserId: null,
        acknowledgedAt: null,
        resolvedByUserId: null,
        resolvedAt: null,
        resolutionNotes: null,
      });
      const saved = await repository.save(created);

      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'SAFETY_INCIDENT',
        aggregateId: saved.id,
        eventType: OutboxEventType.SAFETY_INCIDENT_CREATED,
        payload: {
          incidentId: saved.id,
          rideId: ride.id,
          reporterUserId,
          reporterRole,
          passengerUserId: ride.passengerUserId,
          driverUserId: ride.driverProfile?.userId ?? null,
          incidentType: saved.incidentType,
          severity: saved.severity,
        },
      });
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'SAFETY_INCIDENT',
        aggregateId: saved.id,
        eventType: OutboxEventType.EMERGENCY_CONTACT_NOTIFICATION_REQUESTED,
        payload: {
          incidentId: saved.id,
          rideId: ride.id,
          reporterUserId,
        },
      });

      return saved;
    });

    this.realtimeService.emitSafetyIncidentCreated(incident);
    return this.map(incident);
  }

  async listAdmin(
    query: AdminSafetyIncidentQueryDto,
  ): Promise<SafetyIncidentListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.dataSource
      .getRepository(RideSafetyIncident)
      .createQueryBuilder('incident');
    this.applyAdminFilters(builder, query);
    const [items, totalItems] = await builder
      .orderBy('incident.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((item) => this.map(item)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
      },
    };
  }

  async getAdmin(incidentId: string): Promise<SafetyIncidentResponseDto> {
    const incident = await this.dataSource
      .getRepository(RideSafetyIncident)
      .findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException('El incidente de seguridad no existe');
    }
    return this.map(incident);
  }

  async acknowledge(
    adminUserId: string,
    incidentId: string,
  ): Promise<SafetyIncidentResponseDto> {
    const incident = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RideSafetyIncident);
      const current = await repository.findOne({
        where: { id: incidentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('El incidente de seguridad no existe');
      }
      if (current.status !== SafetyIncidentStatus.OPEN) {
        throw new ConflictException(
          'Solo un incidente OPEN puede ser reconocido',
        );
      }
      current.status = SafetyIncidentStatus.ACKNOWLEDGED;
      current.acknowledgedByUserId = adminUserId;
      current.acknowledgedAt = new Date();
      const saved = await repository.save(current);
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'SAFETY_INCIDENT',
        aggregateId: saved.id,
        eventType: OutboxEventType.SAFETY_INCIDENT_ACKNOWLEDGED,
        payload: { incidentId: saved.id, rideId: saved.rideId, adminUserId },
      });
      return saved;
    });
    this.realtimeService.emitSafetyStatusChanged(incident);
    return this.map(incident);
  }

  async resolve(
    adminUserId: string,
    incidentId: string,
    dto: ResolveSafetyIncidentDto,
  ): Promise<SafetyIncidentResponseDto> {
    if (
      dto.status !== SafetyIncidentStatus.RESOLVED &&
      dto.status !== SafetyIncidentStatus.FALSE_ALARM
    ) {
      throw new BadRequestException(
        'El estado final debe ser RESOLVED o FALSE_ALARM',
      );
    }
    const incident = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RideSafetyIncident);
      const current = await repository.findOne({
        where: { id: incidentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('El incidente de seguridad no existe');
      }
      if (
        current.status === SafetyIncidentStatus.RESOLVED ||
        current.status === SafetyIncidentStatus.FALSE_ALARM
      ) {
        throw new ConflictException('El incidente ya fue cerrado');
      }
      current.status = dto.status;
      current.resolvedByUserId = adminUserId;
      current.resolvedAt = new Date();
      current.resolutionNotes = dto.resolutionNotes.trim();
      const saved = await repository.save(current);
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'SAFETY_INCIDENT',
        aggregateId: saved.id,
        eventType: OutboxEventType.SAFETY_INCIDENT_RESOLVED,
        payload: {
          incidentId: saved.id,
          rideId: saved.rideId,
          adminUserId,
          status: saved.status,
        },
      });
      return saved;
    });
    this.realtimeService.emitSafetyStatusChanged(incident);
    return this.map(incident);
  }

  private async loadRideForUpdate(
    manager: EntityManager,
    rideId: string,
  ): Promise<Ride> {
    const ride = await manager.getRepository(Ride).findOne({
      where: { id: rideId },
      relations: { driverProfile: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ride) throw new NotFoundException('El viaje no existe');
    return ride;
  }

  private assertParticipant(ride: Ride, userId: string): RideStatusActor {
    if (ride.passengerUserId === userId) return RideStatusActor.PASSENGER;
    if (ride.driverProfile?.userId === userId) return RideStatusActor.DRIVER;
    throw new ForbiddenException('Solo un participante puede activar SOS');
  }

  private assertRideAllowsIncident(ride: Ride): void {
    if (ACTIVE_RIDE_STATUSES.includes(ride.status)) return;
    const terminalAllowed =
      ride.status === RideStatus.COMPLETED ||
      ride.status === RideStatus.CANCELLED;
    const reference = ride.completedAt ?? ride.cancelledAt ?? ride.updatedAt;
    if (
      terminalAllowed &&
      reference &&
      Date.now() - reference.getTime() <= this.recentRideGraceSeconds * 1000
    ) {
      return;
    }
    throw new ConflictException(
      'Solo se puede activar SOS durante un viaje activo o recién finalizado',
    );
  }

  private async assertLocationIsPlausible(
    manager: EntityManager,
    rideId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    const raw: unknown = await manager.query(
      `SELECT LEAST(
         ST_Distance(origin_position, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography),
         ST_Distance(destination_position, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)
       ) AS "distanceMeters"
       FROM rides WHERE id = $3`,
      [latitude, longitude, rideId],
    );
    const rows = raw as DistanceResult[];
    const distance = Number(rows[0]?.distanceMeters ?? Number.NaN);
    if (!Number.isFinite(distance)) {
      throw new BadRequestException('No se pudo validar la ubicación del SOS');
    }
    if (distance > this.maxLocationDistanceMeters) {
      throw new BadRequestException(
        'La ubicación del SOS está fuera del área razonable del viaje',
      );
    }
  }

  private async assertNoAccidentalDuplicate(
    manager: EntityManager,
    rideId: string,
    reporterUserId: string,
  ): Promise<void> {
    const result: unknown = await manager.query(
      `SELECT id FROM ride_safety_incidents
       WHERE ride_id = $1 AND reporter_user_id = $2
         AND created_at >= NOW() - INTERVAL '30 seconds'
         AND status IN ('OPEN', 'ACKNOWLEDGED', 'IN_REVIEW')
       LIMIT 1`,
      [rideId, reporterUserId],
    );
    if ((result as Array<{ id: string }>).length > 0) {
      throw new ConflictException(
        'Ya existe un incidente reciente para este viaje',
      );
    }
  }

  private severityFor(type: SafetyIncidentType): SafetyIncidentSeverity {
    switch (type) {
      case SafetyIncidentType.MEDICAL_EMERGENCY:
      case SafetyIncidentType.ACCIDENT:
      case SafetyIncidentType.THREAT:
      case SafetyIncidentType.ROBBERY:
        return SafetyIncidentSeverity.CRITICAL;
      case SafetyIncidentType.HARASSMENT:
      case SafetyIncidentType.UNSAFE_DRIVING:
      case SafetyIncidentType.LOST_CONTACT:
        return SafetyIncidentSeverity.HIGH;
      case SafetyIncidentType.VEHICLE_FAILURE:
      case SafetyIncidentType.OTHER:
        return SafetyIncidentSeverity.MEDIUM;
    }
  }

  private applyAdminFilters(
    builder: SelectQueryBuilder<RideSafetyIncident>,
    query: AdminSafetyIncidentQueryDto,
  ): void {
    if (query.status) {
      builder.andWhere('incident.status = :status', { status: query.status });
    }
    if (query.severity) {
      builder.andWhere('incident.severity = :severity', {
        severity: query.severity,
      });
    }
    if (query.incidentType) {
      builder.andWhere('incident.incident_type = :incidentType', {
        incidentType: query.incidentType,
      });
    }
    if (query.reporterRole) {
      builder.andWhere('incident.reporter_role = :reporterRole', {
        reporterRole: query.reporterRole,
      });
    }
    if (query.rideId) {
      builder.andWhere('incident.ride_id = :rideId', { rideId: query.rideId });
    }
    if (query.dateFrom) {
      builder.andWhere('incident.created_at >= :dateFrom', {
        dateFrom: new Date(`${query.dateFrom}T00:00:00.000Z`),
      });
    }
    if (query.dateTo) {
      const dateTo = new Date(`${query.dateTo}T00:00:00.000Z`);
      dateTo.setUTCDate(dateTo.getUTCDate() + 1);
      builder.andWhere('incident.created_at < :dateTo', { dateTo });
    }
  }

  private map(incident: RideSafetyIncident): SafetyIncidentResponseDto {
    return {
      id: incident.id,
      rideId: incident.rideId,
      reporterUserId: incident.reporterUserId,
      reporterRole: incident.reporterRole,
      incidentType: incident.incidentType,
      severity: incident.severity,
      status: incident.status,
      latitude: incident.latitude,
      longitude: incident.longitude,
      accuracy: incident.accuracy,
      description: incident.description,
      rideStatusSnapshot: incident.rideStatusSnapshot,
      passengerSnapshot: incident.passengerSnapshot,
      driverSnapshot: incident.driverSnapshot,
      vehicleSnapshot: incident.vehicleSnapshot,
      acknowledgedByUserId: incident.acknowledgedByUserId,
      acknowledgedAt: incident.acknowledgedAt,
      resolvedByUserId: incident.resolvedByUserId,
      resolvedAt: incident.resolvedAt,
      resolutionNotes: incident.resolutionNotes,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }
}
