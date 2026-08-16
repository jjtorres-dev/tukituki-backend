import { randomUUID } from 'node:crypto';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RejectDriverApplicationDto } from './reject-driver-application.dto';

function documentObservations(count: number) {
  return Array.from({ length: count }, () => ({
    documentId: randomUUID(),
    reason: 'El documento no es legible',
  }));
}

describe('RejectDriverApplicationDto (DRIVER-ONBOARDING-R2)', () => {
  it('acepta hasta 3 observaciones de documentos (expediente objetivo)', async () => {
    const dto = plainToInstance(RejectDriverApplicationDto, {
      documents: documentObservations(3),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rechaza más de 3 observaciones de documentos', async () => {
    const dto = plainToInstance(RejectDriverApplicationDto, {
      documents: documentObservations(4),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'documents')).toBe(true);
  });
});
