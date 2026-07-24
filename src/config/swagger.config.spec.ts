import { buildSwaggerConfiguration, SWAGGER_TAGS } from './swagger.config';

describe('buildSwaggerConfiguration', () => {
  it('describes the public API server and JWT authentication', () => {
    const configuration = buildSwaggerConfiguration({
      environment: 'test',
      publicApiOrigin: 'https://api.example.com/',
    });

    expect(configuration.info).toMatchObject({
      title: 'TukiTuki API',
      version: '1.0.0',
    });
    expect(configuration.info.description).toContain('mototaxis');
    expect(configuration.servers).toEqual([
      { url: 'https://api.example.com', description: 'test API' },
    ]);
    expect(configuration.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('declares every API tag once and documents the mobile domains', () => {
    const configuration = buildSwaggerConfiguration();
    const tagNames = configuration.tags?.map((tag) => tag.name) ?? [];

    expect(new Set(tagNames).size).toBe(tagNames.length);
    expect(tagNames).toHaveLength(SWAGGER_TAGS.length);
    expect(tagNames).toEqual(
      expect.arrayContaining([
        'Auth',
        'Fares',
        'Passenger rides',
        'Driver rides',
        'Passenger digital payments',
        'Ride safety',
      ]),
    );
  });
});
