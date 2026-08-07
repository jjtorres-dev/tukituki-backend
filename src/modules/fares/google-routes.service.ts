import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { FareEstimateLocationDto } from './dto/fare-estimate-location.dto';

const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

const GOOGLE_ROUTES_TIMEOUT_MS = 10_000;

type GoogleRouteResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
  }>;
};

export type RouteMetrics = {
  distanceMeters: number;
  durationSeconds: number;
};

@Injectable()
export class GoogleRoutesService {
  private readonly logger = new Logger(GoogleRoutesService.name);

  async computeRoute(
    origin: FareEstimateLocationDto,
    destination: FareEstimateLocationDto,
  ): Promise<RouteMetrics> {
    const apiKey = process.env.GOOGLE_ROUTES_API_KEY?.trim();

    if (!apiKey) {
      this.logger.error('GOOGLE_ROUTES_API_KEY no está configurada');

      throw new ServiceUnavailableException(
        'El servicio de rutas no está disponible',
      );
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      GOOGLE_ROUTES_TIMEOUT_MS,
    );

    try {
      const response = await fetch(GOOGLE_ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',

          'X-Goog-Api-Key': apiKey,

          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
            },
          },

          destination: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },

          // Mototaxi / motocicleta.
          travelMode: 'TWO_WHEELER',

          // Por ahora priorizamos baja latencia
          // y una tarifa más estable.
          routingPreference: 'TRAFFIC_UNAWARE',

          computeAlternativeRoutes: false,

          units: 'METRIC',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text();

        this.logger.warn(
          [
            'Google Routes rechazó la solicitud',
            `status=${response.status}`,
            `body=${responseBody.slice(0, 500)}`,
          ].join(' '),
        );

        if (response.status === 400 || response.status === 404) {
          throw new BadRequestException(
            'No se pudo calcular una ruta válida entre el origen y el destino',
          );
        }

        throw new ServiceUnavailableException(
          'El servicio de rutas no está disponible temporalmente',
        );
      }

      const data = (await response.json()) as GoogleRouteResponse;

      const route = data.routes?.[0];

      if (!route || route.distanceMeters == null || route.duration == null) {
        throw new BadRequestException(
          'No existe una ruta disponible entre el origen y el destino',
        );
      }

      const distanceMeters = Math.round(route.distanceMeters);

      const durationSeconds = this.parseDurationSeconds(route.duration);

      if (!Number.isFinite(distanceMeters) || distanceMeters < 1) {
        throw new BadRequestException(
          'Google Routes devolvió una distancia inválida',
        );
      }

      if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
        throw new BadRequestException(
          'Google Routes devolvió una duración inválida',
        );
      }

      this.logger.debug(
        `Ruta calculada: ${distanceMeters}m / ${durationSeconds}s`,
      );

      return {
        distanceMeters,
        durationSeconds,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn('Google Routes excedió el tiempo de espera');

        throw new ServiceUnavailableException(
          'El servicio de rutas tardó demasiado en responder',
        );
      }

      this.logger.error(
        'Error inesperado consultando Google Routes',
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        'No se pudo conectar con el servicio de rutas',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseDurationSeconds(duration: string): number {
    const match = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());

    if (!match) {
      throw new BadRequestException(
        'Google Routes devolvió una duración inválida',
      );
    }

    const seconds = Number.parseFloat(match[1]);

    return Math.max(1, Math.ceil(seconds));
  }
}
