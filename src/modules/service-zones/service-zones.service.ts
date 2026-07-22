import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { CheckServiceZonePointDto } from './dto/check-service-zone-point.dto';
import { CreateServiceZoneDto } from './dto/create-service-zone.dto';
import {
  CheckServiceZonePointResponseDto,
  ServiceZoneListResponseDto,
  ServiceZoneResponseDto,
} from './dto/service-zone-response.dto';
import { ServiceZoneQueryDto } from './dto/service-zone-query.dto';
import { UpdateServiceZoneDto } from './dto/update-service-zone.dto';
import { ServiceZone } from './entities/service-zone.entity';
import type { ServiceZoneBoundary } from './entities/service-zone.entity';
import { ServiceZoneStatus } from './enums/service-zone-status.enum';

interface BoundaryValidationRow {
  isValid: boolean;
  reason: string;
  areaSquareMeters: number;
}

@Injectable()
export class ServiceZonesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(dto: CreateServiceZoneDto): Promise<ServiceZoneResponseDto> {
    const boundary = this.normalizeBoundary(dto.boundary);

    return this.dataSource.transaction(async (manager) => {
      await this.assertBoundaryValid(manager, boundary);

      const repository = manager.getRepository(ServiceZone);

      await this.assertCodeAvailable(repository, dto.code);

      const zone = repository.create({
        name: dto.name,
        code: dto.code,
        description: dto.description ?? null,
        boundary,
        status: ServiceZoneStatus.INACTIVE,
        priority: dto.priority ?? 0,
      });

      const savedZone = await repository.save(zone);

      return this.mapZone(savedZone);
    });
  }

  async list(query: ServiceZoneQueryDto): Promise<ServiceZoneListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.dataSource
      .getRepository(ServiceZone)
      .createQueryBuilder('zone');

    if (query.status !== undefined) {
      queryBuilder.andWhere('zone.status = :status', {
        status: query.status,
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(zone.name ILIKE :search OR zone.code ILIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const [zones, total] = await queryBuilder
      .orderBy('zone.priority', 'DESC')
      .addOrderBy('zone.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: zones.map((zone) => this.mapZone(zone)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getById(zoneId: string): Promise<ServiceZoneResponseDto> {
    const zone = await this.dataSource.getRepository(ServiceZone).findOne({
      where: {
        id: zoneId,
      },
    });

    if (!zone) {
      throw new NotFoundException('La zona de cobertura no existe');
    }

    return this.mapZone(zone);
  }

  async update(
    zoneId: string,
    dto: UpdateServiceZoneDto,
  ): Promise<ServiceZoneResponseDto> {
    const boundary = dto.boundary
      ? this.normalizeBoundary(dto.boundary)
      : undefined;

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceZone);
      const zone = await this.lockZone(repository, zoneId);

      if (dto.code && dto.code !== zone.code) {
        await this.assertCodeAvailable(repository, dto.code, zone.id);
      }

      if (boundary) {
        await this.assertBoundaryValid(manager, boundary);
        zone.boundary = boundary;
      }

      if (dto.name !== undefined) {
        zone.name = dto.name;
      }

      if (dto.code !== undefined) {
        zone.code = dto.code;
      }

      if (dto.description !== undefined) {
        zone.description = dto.description || null;
      }

      if (dto.priority !== undefined) {
        zone.priority = dto.priority;
      }

      const savedZone = await repository.save(zone);

      return this.mapZone(savedZone);
    });
  }

  activate(zoneId: string): Promise<ServiceZoneResponseDto> {
    return this.changeStatus(zoneId, ServiceZoneStatus.ACTIVE);
  }

  deactivate(zoneId: string): Promise<ServiceZoneResponseDto> {
    return this.changeStatus(zoneId, ServiceZoneStatus.INACTIVE);
  }

  async checkPoint(
    dto: CheckServiceZonePointDto,
  ): Promise<CheckServiceZonePointResponseDto> {
    const zone = await this.findActiveZoneForPoint(dto.latitude, dto.longitude);

    return {
      covered: zone !== null,
      zone: zone
        ? {
            id: zone.id,
            name: zone.name,
            code: zone.code,
          }
        : null,
    };
  }

  findActiveZoneForPoint(
    latitude: number,
    longitude: number,
  ): Promise<ServiceZone | null> {
    this.assertPoint(latitude, longitude);

    return this.dataSource
      .getRepository(ServiceZone)
      .createQueryBuilder('zone')
      .where('zone.status = :status', {
        status: ServiceZoneStatus.ACTIVE,
      })
      .andWhere(
        `ST_Covers(
          zone.boundary,
          ST_SetSRID(
            ST_MakePoint(:longitude, :latitude),
            4326
          )::geography
        )`,
        {
          latitude,
          longitude,
        },
      )
      .orderBy('zone.priority', 'DESC')
      .addOrderBy('zone.created_at', 'ASC')
      .getOne();
  }

  private changeStatus(
    zoneId: string,
    status: ServiceZoneStatus,
  ): Promise<ServiceZoneResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceZone);
      const zone = await this.lockZone(repository, zoneId);

      if (zone.status === status) {
        return this.mapZone(zone);
      }

      if (status === ServiceZoneStatus.ACTIVE) {
        await this.assertBoundaryValid(manager, zone.boundary);
      }

      zone.status = status;

      const savedZone = await repository.save(zone);

      return this.mapZone(savedZone);
    });
  }

  private async lockZone(
    repository: Repository<ServiceZone>,
    zoneId: string,
  ): Promise<ServiceZone> {
    const zone = await repository
      .createQueryBuilder('zone')
      .where('zone.id = :zoneId', {
        zoneId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!zone) {
      throw new NotFoundException('La zona de cobertura no existe');
    }

    return zone;
  }

  private async assertCodeAvailable(
    repository: Repository<ServiceZone>,
    code: string,
    ignoredZoneId?: string,
  ): Promise<void> {
    const queryBuilder = repository
      .createQueryBuilder('zone')
      .where('zone.code = :code', {
        code,
      });

    if (ignoredZoneId) {
      queryBuilder.andWhere('zone.id <> :ignoredZoneId', {
        ignoredZoneId,
      });
    }

    if (await queryBuilder.getOne()) {
      throw new ConflictException(
        'Ya existe una zona de cobertura con ese código',
      );
    }
  }

  private normalizeBoundary(boundary: {
    type: 'Polygon';
    coordinates: number[][][];
  }): ServiceZoneBoundary {
    if (boundary.type !== 'Polygon') {
      throw new BadRequestException(
        'La cobertura debe enviarse como un GeoJSON Polygon',
      );
    }

    if (
      !Array.isArray(boundary.coordinates) ||
      boundary.coordinates.length === 0
    ) {
      throw new BadRequestException(
        'El polígono debe contener al menos un anillo',
      );
    }

    const normalizedRings = boundary.coordinates.map((ring, ringIndex) =>
      this.normalizeRing(ring, ringIndex),
    );

    return {
      type: 'Polygon',
      coordinates: normalizedRings,
    };
  }

  private normalizeRing(ring: number[][], ringIndex: number): number[][] {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new BadRequestException(
        `El anillo ${ringIndex + 1} debe contener al menos cuatro coordenadas`,
      );
    }

    const normalizedRing = ring.map((coordinate, coordinateIndex) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        throw new BadRequestException(
          `La coordenada ${coordinateIndex + 1} del anillo ${ringIndex + 1} debe tener [longitud, latitud]`,
        );
      }

      const longitude = coordinate[0];
      const latitude = coordinate[1];

      this.assertPoint(latitude, longitude);

      return [longitude, latitude];
    });

    const first = normalizedRing[0];
    const last = normalizedRing[normalizedRing.length - 1];

    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new BadRequestException(
        `El anillo ${ringIndex + 1} debe cerrar repitiendo su primera coordenada al final`,
      );
    }

    const distinctVertices = new Set(
      normalizedRing.slice(0, -1).map((coordinate) => coordinate.join(',')),
    );

    if (distinctVertices.size < 3) {
      throw new BadRequestException(
        `El anillo ${ringIndex + 1} debe contener al menos tres vértices distintos`,
      );
    }

    return normalizedRing;
  }

  private async assertBoundaryValid(
    manager: EntityManager,
    boundary: ServiceZoneBoundary,
  ): Promise<void> {
    let rows: unknown;

    try {
      rows = (await manager.query(
        `SELECT
          ST_IsValid(geometry_data.geom) AS "isValid",
          ST_IsValidReason(geometry_data.geom) AS "reason",
          ST_Area(geometry_data.geom::geography) AS "areaSquareMeters"
        FROM (
          SELECT ST_SetSRID(
            ST_GeomFromGeoJSON($1),
            4326
          ) AS geom
        ) AS geometry_data`,
        [JSON.stringify(boundary)],
      )) as unknown;
    } catch {
      throw new BadRequestException(
        'El polígono GeoJSON no pudo ser interpretado por PostGIS',
      );
    }

    const result = this.parseBoundaryValidationRow(rows);

    if (!result.isValid) {
      throw new BadRequestException(
        `El polígono no es válido: ${result.reason}`,
      );
    }

    if (
      !Number.isFinite(result.areaSquareMeters) ||
      result.areaSquareMeters <= 0
    ) {
      throw new BadRequestException(
        'El polígono debe tener un área mayor que cero',
      );
    }
  }

  private parseBoundaryValidationRow(rows: unknown): BoundaryValidationRow {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException(
        'PostGIS no devolvió la validación del polígono',
      );
    }

    const firstRow: unknown = rows[0];

    if (typeof firstRow !== 'object' || firstRow === null) {
      throw new BadRequestException(
        'PostGIS devolvió una validación de polígono inválida',
      );
    }

    const record = firstRow as Record<string, unknown>;
    const isValid = record.isValid === true || record.isValid === 'true';
    const reason =
      typeof record.reason === 'string' ? record.reason : 'motivo desconocido';
    const areaSquareMeters = Number(record.areaSquareMeters);

    return {
      isValid,
      reason,
      areaSquareMeters,
    };
  }

  private assertPoint(latitude: number, longitude: number): void {
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException(
        'Las coordenadas geográficas no son válidas',
      );
    }
  }

  private mapZone(zone: ServiceZone): ServiceZoneResponseDto {
    return {
      id: zone.id,
      name: zone.name,
      code: zone.code,
      description: zone.description,
      boundary: zone.boundary,
      status: zone.status,
      priority: zone.priority,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt,
    };
  }
}
