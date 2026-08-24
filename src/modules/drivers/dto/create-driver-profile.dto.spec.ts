import { validate } from 'class-validator';

import { CreateDriverProfileDto } from './create-driver-profile.dto';
import { IdentityDocumentType } from '../enums/identity-document-type.enum';

function baseDto(
  overrides: Partial<CreateDriverProfileDto> = {},
): CreateDriverProfileDto {
  return Object.assign(new CreateDriverProfileDto(), {
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    documentType: IdentityDocumentType.DNI,
    documentNumber: '12345678',
    birthDate: '1995-06-15',
    ...overrides,
  });
}

describe('CreateDriverProfileDto (DRIVER-ONBOARDING-R2)', () => {
  it('acepta la solicitud sin address (ya no es obligatoria en el onboarding)', async () => {
    await expect(validate(baseDto())).resolves.toHaveLength(0);
  });

  it('acepta la solicitud sin email (opcional)', async () => {
    await expect(validate(baseDto())).resolves.toHaveLength(0);
  });

  it('acepta un email válido', async () => {
    const errors = await validate(
      baseDto({ email: 'juan.torres@example.com' }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rechaza un email con formato inválido', async () => {
    const errors = await validate(baseDto({ email: 'no-es-un-email' }));

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('sigue validando address cuando viene informada', async () => {
    const errors = await validate(baseDto({ address: 'ab' }));

    expect(errors.some((error) => error.property === 'address')).toBe(true);
  });
});
