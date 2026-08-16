import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverStatus } from './enums/driver-status.enum';
import { VehicleStatus } from './enums/vehicle-status.enum';
import { VehicleType } from './enums/vehicle-type.enum';

@Injectable()
export class DriverVehiclesService {
  constructor(
    @InjectRepository(DriverVehicle)
    private readonly driverVehiclesRepository: Repository<DriverVehicle>,

    @InjectRepository(DriverProfile)
    private readonly driverProfilesRepository: Repository<DriverProfile>,
  ) {}

  findByDriverProfileId(
    driverProfileId: string,
  ): Promise<DriverVehicle | null> {
    return this.driverVehiclesRepository.findOne({
      where: {
        driverProfileId,
      },
    });
  }

  async createMyVehicle(
    userId: string,
    dto: CreateDriverVehicleDto,
  ): Promise<DriverVehicle> {
    const driverProfile = await this.getDriverProfileOrFail(userId);

    this.assertDriverProfileEditable(driverProfile);

    const existingVehicle = await this.findByDriverProfileId(driverProfile.id);

    if (existingVehicle) {
      throw new ConflictException(
        'El conductor ya tiene un vehículo registrado',
      );
    }

    const vehicle = this.driverVehiclesRepository.create({
      driverProfileId: driverProfile.id,
      plate: dto.plate,
      brand: dto.brand,
      model: dto.model,
      year: dto.year,
      color: dto.color,
      engineNumber: dto.engineNumber ?? null,
      chassisNumber: dto.chassisNumber ?? null,
      ownership: dto.ownership,
      vehicleType: VehicleType.MOTOTAXI,
      status: VehicleStatus.DRAFT,
      rejectionReason: null,
    });

    try {
      return await this.driverVehiclesRepository.save(vehicle);
    } catch (error: unknown) {
      const conflictException = this.getUniqueConstraintException(error);

      if (conflictException) {
        throw conflictException;
      }

      throw error;
    }
  }

  async getMyVehicle(userId: string): Promise<DriverVehicle> {
    const driverProfile = await this.getDriverProfileOrFail(userId);

    const vehicle = await this.findByDriverProfileId(driverProfile.id);

    if (!vehicle) {
      throw new NotFoundException('Todavía no has registrado un vehículo');
    }

    return vehicle;
  }

  async updateMyVehicle(
    userId: string,
    dto: UpdateDriverVehicleDto,
  ): Promise<DriverVehicle> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar',
      );
    }

    const driverProfile = await this.getDriverProfileOrFail(userId);

    this.assertDriverProfileEditable(driverProfile);

    const vehicle = await this.findByDriverProfileId(driverProfile.id);

    if (!vehicle) {
      throw new NotFoundException('Todavía no has registrado un vehículo');
    }

    this.assertVehicleEditable(vehicle);

    if (dto.plate !== undefined) {
      vehicle.plate = dto.plate;
    }

    if (dto.brand !== undefined) {
      vehicle.brand = dto.brand;
    }

    if (dto.model !== undefined) {
      vehicle.model = dto.model;
    }

    if (dto.year !== undefined) {
      vehicle.year = dto.year;
    }

    if (dto.color !== undefined) {
      vehicle.color = dto.color;
    }

    if (dto.engineNumber !== undefined) {
      vehicle.engineNumber = dto.engineNumber;
    }

    if (dto.chassisNumber !== undefined) {
      vehicle.chassisNumber = dto.chassisNumber;
    }

    if (dto.ownership !== undefined) {
      vehicle.ownership = dto.ownership;
    }

    if (vehicle.status === VehicleStatus.REJECTED) {
      vehicle.status = VehicleStatus.DRAFT;
      vehicle.rejectionReason = null;
    }

    try {
      return await this.driverVehiclesRepository.save(vehicle);
    } catch (error: unknown) {
      const conflictException = this.getUniqueConstraintException(error);

      if (conflictException) {
        throw conflictException;
      }

      throw error;
    }
  }

  private async getDriverProfileOrFail(userId: string): Promise<DriverProfile> {
    const driverProfile = await this.driverProfilesRepository.findOne({
      where: {
        userId,
      },
    });

    if (!driverProfile) {
      throw new NotFoundException(
        'Primero debes crear tu solicitud de conductor',
      );
    }

    return driverProfile;
  }

  private assertDriverProfileEditable(driverProfile: DriverProfile): void {
    const editableStatuses = [DriverStatus.DRAFT, DriverStatus.REJECTED];

    if (!editableStatuses.includes(driverProfile.status)) {
      throw new BadRequestException(
        'No puedes modificar el vehículo mientras la solicitud del conductor está en su estado actual',
      );
    }
  }

  private assertVehicleEditable(vehicle: DriverVehicle): void {
    const editableStatuses = [VehicleStatus.DRAFT, VehicleStatus.REJECTED];

    if (!editableStatuses.includes(vehicle.status)) {
      throw new BadRequestException(
        'El vehículo no puede modificarse en su estado actual',
      );
    }
  }

  private getUniqueConstraintException(
    error: unknown,
  ): ConflictException | null {
    if (!(error instanceof QueryFailedError)) {
      return null;
    }

    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };

    if (driverError.code !== '23505') {
      return null;
    }

    switch (driverError.constraint) {
      case 'UQ_driver_vehicles_driver_profile_id':
        return new ConflictException(
          'El conductor ya tiene un vehículo registrado',
        );

      case 'UQ_driver_vehicles_plate':
        return new ConflictException('La placa ya está registrada');

      case 'UQ_driver_vehicles_engine_number':
        return new ConflictException('El número de motor ya está registrado');

      case 'UQ_driver_vehicles_chassis_number':
        return new ConflictException('El número de chasis ya está registrado');

      default:
        return new ConflictException(
          'Los datos del vehículo ya están registrados',
        );
    }
  }
}
