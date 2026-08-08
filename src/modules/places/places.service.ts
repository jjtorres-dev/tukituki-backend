import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  PlaceAutocompleteItemDto,
  PlacesAutocompleteDto,
  PlacesAutocompleteResponseDto,
} from './dto/places-autocomplete.dto';
import {
  PlaceDetailsQueryDto,
  PlaceDetailsResponseDto,
} from './dto/place-details.dto';

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  'https://places.googleapis.com/v1/places:autocomplete';

const GOOGLE_PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places';

const GOOGLE_PLACES_TIMEOUT_MS = 8_000;

/*
 * Tarapoto + Morales + Banda de Shilcayo
 * y alrededores.
 *
 * Es un bias, no una restricción absoluta.
 * La cobertura operativa real sigue
 * validándose en nuestro backend/PostGIS.
 */
const AUTOCOMPLETE_BIAS_RADIUS_METERS = 25_000;

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;

      text?: {
        text?: string;
      };

      structuredFormat?: {
        mainText?: {
          text?: string;
        };

        secondaryText?: {
          text?: string;
        };
      };

      distanceMeters?: number;
    };
  }>;
};

type GooglePlaceDetailsResponse = {
  id?: string;

  formattedAddress?: string;

  location?: {
    latitude?: number;
    longitude?: number;
  };
};

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  async autocomplete(
    dto: PlacesAutocompleteDto,
  ): Promise<PlacesAutocompleteResponseDto> {
    const apiKey = this.getApiKey();

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      GOOGLE_PLACES_TIMEOUT_MS,
    );

    try {
      const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',

          'X-Goog-Api-Key': apiKey,

          'X-Goog-FieldMask': [
            'suggestions.placePrediction.placeId',
            'suggestions.placePrediction.text.text',
            'suggestions.placePrediction.structuredFormat.mainText.text',
            'suggestions.placePrediction.structuredFormat.secondaryText.text',
            'suggestions.placePrediction.distanceMeters',
          ].join(','),
        },

        body: JSON.stringify({
          input: dto.input,

          languageCode: 'es',

          regionCode: 'pe',

          includedRegionCodes: ['pe'],

          includeQueryPredictions: false,

          origin: {
            latitude: dto.latitude,

            longitude: dto.longitude,
          },

          locationBias: {
            circle: {
              center: {
                latitude: dto.latitude,

                longitude: dto.longitude,
              },

              radius: AUTOCOMPLETE_BIAS_RADIUS_METERS,
            },
          },

          ...(dto.sessionToken
            ? {
                sessionToken: dto.sessionToken,
              }
            : {}),
        }),

        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Google Places Autocomplete rechazó la solicitud: status=${response.status}`,
        );

        if (response.status === 400) {
          throw new BadRequestException(
            'No se pudo procesar la búsqueda del destino',
          );
        }

        throw new ServiceUnavailableException(
          'El buscador de destinos no está disponible temporalmente',
        );
      }

      const data = (await response.json()) as GoogleAutocompleteResponse;

      const items = this.mapAutocompleteItems(data);

      return {
        items,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(
          'Google Places Autocomplete excedió el tiempo de espera',
        );

        throw new ServiceUnavailableException(
          'El buscador de destinos tardó demasiado en responder',
        );
      }

      this.logger.error(
        'Error inesperado consultando Google Places Autocomplete',
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        'No se pudo conectar con el buscador de destinos',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async getDetails(
    placeId: string,
    query: PlaceDetailsQueryDto,
  ): Promise<PlaceDetailsResponseDto> {
    const normalizedPlaceId = placeId.trim();

    if (normalizedPlaceId.length === 0 || normalizedPlaceId.length > 500) {
      throw new BadRequestException(
        'El identificador del destino no es válido',
      );
    }

    const apiKey = this.getApiKey();

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      GOOGLE_PLACES_TIMEOUT_MS,
    );

    try {
      const searchParams = new URLSearchParams({
        languageCode: 'es',

        regionCode: 'pe',
      });

      if (query.sessionToken) {
        searchParams.set('sessionToken', query.sessionToken);
      }

      const url =
        `${GOOGLE_PLACES_DETAILS_URL}/` +
        `${encodeURIComponent(normalizedPlaceId)}` +
        `?${searchParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',

        headers: {
          'Content-Type': 'application/json',

          'X-Goog-Api-Key': apiKey,

          /*
           * Pedimos solo lo necesario
           * para convertir la selección
           * en coordenadas.
           */
          'X-Goog-FieldMask': 'id,formattedAddress,location',
        },

        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Google Place Details rechazó la solicitud: status=${response.status}`,
        );

        if (response.status === 404) {
          throw new NotFoundException(
            'El destino seleccionado ya no está disponible',
          );
        }

        if (response.status === 400) {
          throw new BadRequestException('El destino seleccionado no es válido');
        }

        throw new ServiceUnavailableException(
          'No se pudieron obtener los detalles del destino',
        );
      }

      const data = (await response.json()) as GooglePlaceDetailsResponse;

      const latitude = data.location?.latitude;

      const longitude = data.location?.longitude;

      if (
        !data.id ||
        typeof data.formattedAddress !== 'string' ||
        !data.formattedAddress.trim() ||
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        throw new BadRequestException(
          'Google Places devolvió un destino incompleto',
        );
      }

      return {
        placeId: data.id,

        formattedAddress: data.formattedAddress.trim(),

        latitude,

        longitude,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn('Google Place Details excedió el tiempo de espera');

        throw new ServiceUnavailableException(
          'La búsqueda del destino tardó demasiado en responder',
        );
      }

      this.logger.error(
        'Error inesperado consultando Google Place Details',
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        'No se pudo consultar el destino seleccionado',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private getApiKey(): string {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

    if (!apiKey) {
      this.logger.error('GOOGLE_PLACES_API_KEY no está configurada');

      throw new ServiceUnavailableException(
        'El buscador de destinos no está disponible',
      );
    }

    return apiKey;
  }

  private mapAutocompleteItems(
    data: GoogleAutocompleteResponse,
  ): PlaceAutocompleteItemDto[] {
    const items: PlaceAutocompleteItemDto[] = [];

    for (const suggestion of data.suggestions ?? []) {
      const prediction = suggestion.placePrediction;

      if (!prediction?.placeId) {
        continue;
      }

      const fullText = prediction.text?.text?.trim() ?? '';

      const primaryText =
        prediction.structuredFormat?.mainText?.text?.trim() || fullText;

      const secondaryText =
        prediction.structuredFormat?.secondaryText?.text?.trim() ?? '';

      if (!primaryText) {
        continue;
      }

      const distanceMeters =
        typeof prediction.distanceMeters === 'number' &&
        Number.isFinite(prediction.distanceMeters) &&
        prediction.distanceMeters > 0
          ? Math.round(prediction.distanceMeters)
          : null;

      items.push({
        placeId: prediction.placeId,

        primaryText,

        secondaryText,

        fullText:
          fullText || [primaryText, secondaryText].filter(Boolean).join(', '),

        distanceMeters,
      });
    }

    return items;
  }
}
