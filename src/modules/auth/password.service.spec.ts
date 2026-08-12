import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('compara normalmente un hash almacenado', async () => {
    const hash = await service.hash('Password123!');

    await expect(
      service.verifyWithFallback('Password123!', hash),
    ).resolves.toBe(true);
  });

  it('ejecuta la comparación ficticia pero nunca autentica un hash ausente', async () => {
    await expect(
      service.verifyWithFallback('Password123!', null),
    ).resolves.toBe(false);
  });
});
