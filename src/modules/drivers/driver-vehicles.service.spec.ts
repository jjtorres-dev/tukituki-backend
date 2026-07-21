import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import type { DeepPartial, FindOneOptions } from 'typeorm';

import { DriverVehiclesService } from './driver-vehicles.service';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverStatus } from './enums/driver-status.enum';
import { IdentityDocumentType } from './enums/identity-document-type.enum';
import { VehicleStatus } from './enums/vehicle-status.enum';
import { VehicleType } from './enums/vehicle-type.enum';

type DriverProfileRepositoryMock = {
  findOne: jest.Mock<
    Promise<DriverProfile | null>,
    [FindOneOptions<DriverProfile>]
  >;
};

type DriverVehicleRepositoryMock = {
  findOne: jest.Mock<
    Promise<DriverVehicle | null>,
    [FindOneOptions<DriverVehicle>]
  >;

  create: jest.Mock<DriverVehicle, [DeepPartial<DriverVehicle>]>;

  save: jest.Mock<Promise<DriverVehicle>, [DriverVehicle]>;
};

describe('DriverVehiclesService', () => {
  let service: DriverVehiclesService;
  let driverProfilesRepository: DriverProfileRepositoryMock;
  let driverVehiclesRepository: DriverVehicleRepositoryMock;

  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const driverProfile: DriverProfile = {
    id: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
    userId,
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    documentType: IdentityDocumentType.DNI,
    documentNumber: '12345678',
    birthDate: '1995-06-15',
    address: 'Jr. Los Jardines 245, Tarapoto',
    photoUrl: null,
    status: DriverStatus.DRAFT,
    rejectionReason: null,
    submittedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T12:00:00.000Z'),
  } as DriverProfile;

  const vehicle: DriverVehicle = {
    id: '6a083c8e-37aa-46cb-82bb-6fd482072c73',
    driverProfileId: driverProfile.id,
    plate: '1234-AB',
    brand: 'Bajaj',
    model: 'RE 4S',
    year: 2024,
    color: 'Azul',
    engineNumber: 'ENG123456789',
    chassisNumber: 'CHS123456789',
    vehicleType: VehicleType.MOTOTAXI,
    status: VehicleStatus.DRAFT,
    rejectionReason: null,
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T12:00:00.000Z'),
  } as DriverVehicle;

  beforeEach(async () => {
    const driverProfileRepositoryMock: DriverProfileRepositoryMock = {
      findOne: jest.fn<
        Promise<DriverProfile | null>,
        [FindOneOptions<DriverProfile>]
      >(),
    };

    const driverVehicleRepositoryMock: DriverVehicleRepositoryMock = {
      findOne: jest.fn<
        Promise<DriverVehicle | null>,
        [FindOneOptions<DriverVehicle>]
      >(),

      create: jest.fn<DriverVehicle, [DeepPartial<DriverVehicle>]>(
        (input: DeepPartial<DriverVehicle>): DriverVehicle =>
          input as DriverVehicle,
      ),

      save: jest.fn<Promise<DriverVehicle>, [DriverVehicle]>(
        (entity: DriverVehicle): Promise<DriverVehicle> =>
          Promise.resolve(entity),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverVehiclesService,
        {
          provide: getRepositoryToken(DriverProfile),
          useValue: driverProfileRepositoryMock,
        },
        {
          provide: getRepositoryToken(DriverVehicle),
          useValue: driverVehicleRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<DriverVehiclesService>(DriverVehiclesService);

    driverProfilesRepository = module.get<DriverProfileRepositoryMock>(
      getRepositoryToken(DriverProfile),
    );

    driverVehiclesRepository = module.get<DriverVehicleRepositoryMock>(
      getRepositoryToken(DriverVehicle),
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe crear un vehículo en borrador', async () => {
    driverProfilesRepository.findOne.mockResolvedValue({
      ...driverProfile,
    });

    driverVehiclesRepository.findOne.mockResolvedValue(null);

    const result = await service.createMyVehicle(userId, {
      plate: '1234-AB',
      brand: 'Bajaj',
      model: 'RE 4S',
      year: 2024,
      color: 'Azul',
      engineNumber: 'ENG123456789',
      chassisNumber: 'CHS123456789',
    });

    expect(result.status).toBe(VehicleStatus.DRAFT);

    expect(result.vehicleType).toBe(VehicleType.MOTOTAXI);

    expect(driverVehiclesRepository.save).toHaveBeenCalledTimes(1);
  });

  it('debe rechazar un segundo vehículo', async () => {
    driverProfilesRepository.findOne.mockResolvedValue({
      ...driverProfile,
    });

    driverVehiclesRepository.findOne.mockResolvedValue({
      ...vehicle,
    });

    await expect(
      service.createMyVehicle(userId, {
        plate: '5678-CD',
        brand: 'TVS',
        model: 'King',
        year: 2025,
        color: 'Rojo',
        engineNumber: 'ENG987654321',
        chassisNumber: 'CHS987654321',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('debe responder 404 sin perfil de conductor', async () => {
    driverProfilesRepository.findOne.mockResolvedValue(null);

    await expect(service.getMyVehicle(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('debe actualizar un vehículo en borrador', async () => {
    driverProfilesRepository.findOne.mockResolvedValue({
      ...driverProfile,
    });

    driverVehiclesRepository.findOne.mockResolvedValue({
      ...vehicle,
    });

    const result = await service.updateMyVehicle(userId, {
      color: 'Rojo',
    });

    expect(result.color).toBe('Rojo');

    expect(driverVehiclesRepository.save).toHaveBeenCalledTimes(1);
  });

  it('debe impedir editar cuando la solicitud está pendiente', async () => {
    driverProfilesRepository.findOne.mockResolvedValue({
      ...driverProfile,
      status: DriverStatus.PENDING_REVIEW,
    });

    await expect(
      service.updateMyVehicle(userId, {
        color: 'Negro',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe devolver un vehículo rechazado a borrador al corregirlo', async () => {
    driverProfilesRepository.findOne.mockResolvedValue({
      ...driverProfile,
      status: DriverStatus.REJECTED,
    });

    driverVehiclesRepository.findOne.mockResolvedValue({
      ...vehicle,
      status: VehicleStatus.REJECTED,
      rejectionReason: 'La placa no es legible',
    });

    const result = await service.updateMyVehicle(userId, {
      plate: '9876-ZY',
    });

    expect(result.status).toBe(VehicleStatus.DRAFT);

    expect(result.rejectionReason).toBeNull();
  });
});
