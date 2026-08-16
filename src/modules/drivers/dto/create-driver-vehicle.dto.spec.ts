import { validate } from 'class-validator';

import { CreateDriverVehicleDto } from './create-driver-vehicle.dto';
import { VehicleOwnership } from '../enums/vehicle-ownership.enum';

function baseDto(
  overrides: Partial<CreateDriverVehicleDto> = {},
): CreateDriverVehicleDto {
  return Object.assign(new CreateDriverVehicleDto(), {
    plate: '1234-AB',
    brand: 'Bajaj',
    model: 'RE 4S',
    year: 2024,
    color: 'Azul',
    ownership: VehicleOwnership.OWNED,
    ...overrides,
  });
}

describe('CreateDriverVehicleDto (DRIVER-ONBOARDING-R2)', () => {
  it('acepta el vehículo sin engineNumber (ya no se pide manualmente)', async () => {
    await expect(validate(baseDto())).resolves.toHaveLength(0);
  });

  it('acepta el vehículo sin chassisNumber (ya no se pide manualmente)', async () => {
    await expect(validate(baseDto())).resolves.toHaveLength(0);
  });

  it('acepta ownership OWNED', async () => {
    const errors = await validate(
      baseDto({ ownership: VehicleOwnership.OWNED }),
    );

    expect(errors).toHaveLength(0);
  });

  it('acepta ownership RENTED', async () => {
    const errors = await validate(
      baseDto({ ownership: VehicleOwnership.RENTED }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rechaza un ownership fuera del enum', async () => {
    const errors = await validate(
      baseDto({ ownership: 'LEASED' as VehicleOwnership }),
    );

    expect(errors.some((error) => error.property === 'ownership')).toBe(true);
  });

  it('rechaza si ownership no viene informado', async () => {
    const dto = baseDto();

    delete (dto as Partial<CreateDriverVehicleDto>).ownership;

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'ownership')).toBe(true);
  });
});
