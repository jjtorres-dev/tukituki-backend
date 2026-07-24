import { assertDevelopmentSeedEnvironment } from './seed-environment.guard';

describe('assertDevelopmentSeedEnvironment', () => {
  it.each(['development', 'test'])(
    'permite ejecutar el seed en %s',
    (environment) => {
      expect(() => assertDevelopmentSeedEnvironment(environment)).not.toThrow();
    },
  );

  it.each(['production', 'staging'])('bloquea el seed en %s', (environment) => {
    expect(() => assertDevelopmentSeedEnvironment(environment)).toThrow(
      'El seed operativo solo puede ejecutarse con NODE_ENV=development o test',
    );
  });
});
