import { BadRequestException } from '@nestjs/common';

import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';

export const REQUIRED_OPERATIONAL_DOCUMENTS: readonly DriverDocumentType[] = [
  DriverDocumentType.DRIVER_LICENSE,
  DriverDocumentType.SOAT,
];

export function assertDriverOperationalRequirements(
  vehicle: DriverVehicle | null,
  documents: DriverDocument[],
  today: string,
): void {
  const invalidRequirements: string[] = [];

  if (!vehicle) {
    invalidRequirements.push('DRIVER_VEHICLE_MISSING');
  } else if (vehicle.status !== VehicleStatus.APPROVED) {
    invalidRequirements.push(`DRIVER_VEHICLE_STATUS_${vehicle.status}`);
  }

  const documentsByType = new Map(
    documents.map((document) => [document.type, document]),
  );

  for (const requiredType of REQUIRED_OPERATIONAL_DOCUMENTS) {
    const document = documentsByType.get(requiredType);

    if (!document) {
      invalidRequirements.push(`${requiredType}_MISSING`);

      continue;
    }

    if (document.status !== DriverDocumentStatus.APPROVED) {
      invalidRequirements.push(`${requiredType}_STATUS_${document.status}`);
    }

    if (!document.expiresAt) {
      invalidRequirements.push(`${requiredType}_EXPIRATION_MISSING`);
    } else if (document.expiresAt < today) {
      invalidRequirements.push(`${requiredType}_EXPIRED`);
    }
  }

  if (invalidRequirements.length > 0) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'El conductor no cumple los requisitos para conectarse',
      invalidRequirements,
      error: 'Bad Request',
    });
  }
}
