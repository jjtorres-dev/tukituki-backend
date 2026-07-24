const ALLOWED_SEED_ENVIRONMENTS = new Set(['development', 'test']);

export function assertDevelopmentSeedEnvironment(
  environment = process.env.NODE_ENV ?? 'development',
): void {
  if (!ALLOWED_SEED_ENVIRONMENTS.has(environment)) {
    throw new Error(
      'El seed operativo solo puede ejecutarse con NODE_ENV=development o test',
    );
  }
}
