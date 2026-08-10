import { validate } from 'class-validator';
import { RegisterPassengerDto } from './register-passenger.dto';

function registrationWith(password: string): RegisterPassengerDto {
  return Object.assign(new RegisterPassengerDto(), {
    phoneE164: '+51921274358',
    password,
  });
}

function validationMessages(
  errors: Awaited<ReturnType<typeof validate>>,
): string[] {
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('RegisterPassengerDto', () => {
  it('acepta una contraseña que cumple toda la política', async () => {
    await expect(validate(registrationWith('Carlos123!'))).resolves.toEqual([]);
  });

  it('rechaza una contraseña sin carácter especial', async () => {
    const errors = await validate(registrationWith('Carlos123'));

    expect(validationMessages(errors)).toContain(
      'La contraseña debe incluir un carácter especial',
    );
  });
});
