import { validate } from 'class-validator';

import { LoginDto } from './login.dto';

function loginWith(phoneE164: string, password: string): LoginDto {
  return Object.assign(new LoginDto(), { phoneE164, password });
}

describe('LoginDto', () => {
  it('acepta un teléfono peruano E.164 y una contraseña acotada', async () => {
    await expect(
      validate(loginWith('+51926928920', 'Password123!')),
    ).resolves.toHaveLength(0);
  });

  it.each([
    "+51926928920' OR '1'='1",
    '+51926928920;DROP TABLE users',
    '${7*7}',
    '<script>alert(1)</script>',
  ])('rechaza entradas de teléfono no permitidas: %s', async (phoneE164) => {
    const errors = await validate(loginWith(phoneE164, 'Password123!'));

    expect(errors.some((error) => error.property === 'phoneE164')).toBe(true);
  });
});
