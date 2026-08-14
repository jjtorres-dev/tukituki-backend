import { Injectable, Logger } from '@nestjs/common';

const GOOGLE_GEOCODING_URL =
  'https://maps.googleapis.com/maps/api/geocode/json';

const GOOGLE_GEOCODING_TIMEOUT_MS = 6_000;

/*
 * Fallback honesto (Fase 13 / decisión de producto G4B-R2): si el
 * reverse geocoding falla por cualquier motivo, NUNCA volvemos a
 * afirmar una dirección falsa ni bloqueamos la cotización.
 */
export const FALLBACK_ORIGIN_ADDRESS = 'Ubicación seleccionada';

type GoogleGeocodingResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
  }>;
};

/*
 * Reverse geocoding (lat/lng -> dirección legible) para el pickup
 * real del Passenger. Reutiliza GOOGLE_PLACES_API_KEY (mismo patrón
 * de configuración que ya usa el módulo Places): requiere que la
 * Geocoding API esté habilitada para esa key en Google Cloud
 * Console. Esa habilitación es un requisito operativo externo que
 * NO puede verificarse desde código — si no está habilitada, Google
 * responde con un status de error HTTP/negocio y este servicio cae
 * al fallback exactamente igual que ante cualquier otro fallo.
 */
@Injectable()
export class GoogleGeocodingService {
  private readonly logger = new Logger(GoogleGeocodingService.name);

  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_PLACES_API_KEY no está configurada: se usa el fallback de reverse geocoding',
      );

      return FALLBACK_ORIGIN_ADDRESS;
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      GOOGLE_GEOCODING_TIMEOUT_MS,
    );

    try {
      const url = new URL(GOOGLE_GEOCODING_URL);

      url.searchParams.set('latlng', `${latitude},${longitude}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('language', 'es');

      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Google Geocoding respondió status HTTP=${response.status}: se usa fallback`,
        );

        return FALLBACK_ORIGIN_ADDRESS;
      }

      const data = (await response.json()) as GoogleGeocodingResponse;

      if (data.status !== 'OK') {
        /*
         * Cubre ZERO_RESULTS, REQUEST_DENIED (p.ej. Geocoding API no
         * habilitada para esta key), OVER_QUERY_LIMIT, etc. — todos
         * se tratan igual: fallback, sin bloquear la cotización.
         */
        this.logger.warn(
          `Google Geocoding devolvió status=${data.status ?? 'desconocido'}: se usa fallback`,
        );

        return FALLBACK_ORIGIN_ADDRESS;
      }

      const address = data.results?.[0]?.formatted_address?.trim();

      if (!address) {
        this.logger.warn(
          'Google Geocoding devolvió OK sin formatted_address: se usa fallback',
        );

        return FALLBACK_ORIGIN_ADDRESS;
      }

      return address;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(
          'Google Geocoding excedió el tiempo de espera: se usa fallback',
        );
      } else {
        this.logger.warn(
          'Error inesperado en reverse geocoding, se usa fallback: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }

      return FALLBACK_ORIGIN_ADDRESS;
    } finally {
      clearTimeout(timeout);
    }
  }
}
