import {
  FALLBACK_ORIGIN_ADDRESS,
  GoogleGeocodingService,
} from './google-geocoding.service';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('GoogleGeocodingService', () => {
  let service: GoogleGeocodingService;

  const originalApiKey = process.env.GOOGLE_PLACES_API_KEY;

  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new GoogleGeocodingService();

    process.env.GOOGLE_PLACES_API_KEY = 'test-places-api-key-1234567890';

    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = originalApiKey;

    global.fetch = originalFetch;

    jest.restoreAllMocks();
  });

  it('devuelve la dirección real cuando Google responde OK con formatted_address', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [{ formatted_address: 'Jr. Lima 250, Tarapoto, Perú' }],
      }),
    );

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe('Jr. Lima 250, Tarapoto, Perú');
  });

  it('nunca modifica ni le pide a Google las coordenadas: las pasa tal cual en la URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [{ formatted_address: 'Dirección real' }],
      }),
    );

    await service.reverseGeocode(-6.4877123, -76.3599456);

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0] as [URL];

    expect(calledUrl.searchParams.get('latlng')).toBe('-6.4877123,-76.3599456');
  });

  it('fallback ante timeout (AbortError)', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe(FALLBACK_ORIGIN_ADDRESS);
  });

  it('fallback ante error HTTP (respuesta no ok)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, false, 500));

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe(FALLBACK_ORIGIN_ADDRESS);
  });

  it('fallback ante ZERO_RESULTS', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ status: 'ZERO_RESULTS', results: [] }),
    );

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe(FALLBACK_ORIGIN_ADDRESS);
  });

  it('fallback ante REQUEST_DENIED (p.ej. Geocoding API no habilitada para la key)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ status: 'REQUEST_DENIED', results: [] }),
    );

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe(FALLBACK_ORIGIN_ADDRESS);
  });

  it('fallback cuando Google responde OK pero sin formatted_address utilizable', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ status: 'OK', results: [{}] }),
    );

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe(FALLBACK_ORIGIN_ADDRESS);
  });

  it('fallback ante un error de red genérico, sin lanzar', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('network unreachable'),
    );

    await expect(service.reverseGeocode(-6.4877, -76.3599)).resolves.toBe(
      FALLBACK_ORIGIN_ADDRESS,
    );
  });

  it('fallback sin siquiera llamar a Google si GOOGLE_PLACES_API_KEY no está configurada', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const address = await service.reverseGeocode(-6.4877, -76.3599);

    expect(address).toBe(FALLBACK_ORIGIN_ADDRESS);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
