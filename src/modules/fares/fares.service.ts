import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { EstimateFareDto } from './dto/estimate-fare.dto';
import { FareEstimateResponseDto } from './dto/fare-estimate-response.dto';
import { FareQuote } from './entities/fare-quote.entity';
import { FareRule } from './entities/fare-rule.entity';
import { FareQuoteStatus } from './enums/fare-quote-status.enum';
import { FareRuleStatus } from './enums/fare-rule-status.enum';
import {
  FALLBACK_DESTINATION_ADDRESS,
  GoogleGeocodingService,
} from './google-geocoding.service';
import { GoogleRoutesService, RouteMetrics } from './google-routes.service';
import {
  applyMultiplierToCents,
  calculateDistanceAmountCents,
  calculateTimeAmountCents,
  combineMultipliersScaledThree,
  formatCents,
  formatScaledInteger,
  parseScaledDecimal,
} from './utils/fixed-decimal.util';

const FARE_QUOTE_TTL_MS = 5 * 60 * 1000;

/*
 * LEGACY FALLBACK (G4B-CONTRACT-R1) — ya NO es la señal principal.
 *
 * Literal exacto que versiones de Passenger anteriores a
 * `EstimateFareDto.destination.isManualSelection` escriben cuando el
 * destino se elige tocando el mapa. Se conserva únicamente para que
 * esa única instalación anterior (un APK de prueba en el celular
 * físico de JuanJo — sin distribución pública, ver
 * `docs/contexto/App-passenger/errores-conocidos.md`) siga
 * funcionando mientras no se reinstale con una versión que ya manda
 * la bandera explícita.
 *
 * RETIRAR este bloque (la constante, su uso en `requiresDestinationGeocoding`
 * más abajo, y el test que lo cubre en fares.service.spec.ts) en cuanto
 * se confirme que ese APK fue reinstalado — no depende de una fecha,
 * depende de ese reinstall.
 */
const MANUAL_DESTINATION_PLACEHOLDER = 'Destino seleccionado en el mapa';

@Injectable()
export class FaresService {
  constructor(
    private readonly dataSource: DataSource,

    private readonly googleRoutesService: GoogleRoutesService,

    private readonly googleGeocodingService: GoogleGeocodingService,
  ) {}

  async estimate(
    passengerUserId: string,
    dto: EstimateFareDto,
  ): Promise<FareEstimateResponseDto> {
    this.assertDifferentPoints(dto);

    /*
     * Reverse geocoding ANTES de la transacción: son llamadas
     * externas (hasta ~6s cada una) que no dependen de ningún lock,
     * así que no tiene sentido mantenerlas abiertas mientras se
     * sostienen los pessimistic_read de User/ServiceZone/FareRule.
     * Nunca lanzan (Fase 13): ante cualquier fallo devuelven el
     * fallback honesto y la cotización sigue su curso normal.
     *
     * origin: SIEMPRE se resuelve por reverse geocoding — el cliente
     * nunca manda una dirección real para origin (GPS puro).
     *
     * destination (G4B-R4, señal desde G4B-CONTRACT-R1):
     * `isManualSelection === true` es la señal real de que el cliente
     * eligió el punto tocando el mapa — dispara reverse geocoding sin
     * importar qué texto traiga `address`. Si ya viene de autocomplete
     * (`isManualSelection` ausente o `false`, dirección real), NO se
     * reemplaza — evita una llamada innecesaria y respeta la
     * dirección que el propio Passenger vio y confirmó.
     *
     * Fallback LEGACY: solo cuando `isManualSelection` viene ausente
     * (cliente anterior a este campo) se recurre a comparar `address`
     * contra el placeholder histórico — ver el comentario de
     * `MANUAL_DESTINATION_PLACEHOLDER` arriba para cuándo retirarlo.
     * Un cliente nuevo que mande `isManualSelection: false` de forma
     * explícita NUNCA cae en este fallback, aunque su `address`
     * coincida por casualidad con el literal legado.
     *
     * Promise.all: ambas llamadas son independientes entre sí, así
     * que se ejecutan concurrentemente en vez de sumar su latencia.
     */
    const destinationAddressFromClient = dto.destination.address.trim();

    const requiresDestinationGeocoding =
      dto.destination.isManualSelection === true ||
      (dto.destination.isManualSelection === undefined &&
        destinationAddressFromClient === MANUAL_DESTINATION_PLACEHOLDER);

    const [originAddress, destinationAddress] = await Promise.all([
      this.googleGeocodingService.reverseGeocode(
        dto.origin.latitude,
        dto.origin.longitude,
      ),

      requiresDestinationGeocoding
        ? this.googleGeocodingService.reverseGeocode(
            dto.destination.latitude,
            dto.destination.longitude,
            FALLBACK_DESTINATION_ADDRESS,
          )
        : Promise.resolve(destinationAddressFromClient),
    ]);

    return this.dataSource.transaction(async (manager) => {
      const passenger = await this.lockPassenger(manager, passengerUserId);

      this.assertPassengerEnabled(passenger);

      /*
       * Primero comprobamos cobertura.
       *
       * De esta forma evitamos consumir
       * Google Routes para puntos que
       * TukiTuki ni siquiera atiende.
       */
      const originZone = await this.findActiveZoneForPoint(
        manager,
        dto.origin.latitude,
        dto.origin.longitude,
      );

      const destinationZone = await this.findActiveZoneForPoint(
        manager,
        dto.destination.latitude,
        dto.destination.longitude,
      );

      if (!originZone) {
        throw new BadRequestException(
          'El origen se encuentra fuera de la zona de cobertura',
        );
      }

      if (!destinationZone) {
        throw new BadRequestException(
          'El destino se encuentra fuera de la zona de cobertura',
        );
      }

      /*
       * distanceMeters y durationSeconds
       * provienen exclusivamente del backend.
       *
       * La polyline también viene de
       * la misma ruta calculada por Google.
       */
      const routeMetrics = await this.googleRoutesService.computeRoute(
        dto.origin,
        dto.destination,
      );

      this.assertRouteMetrics(
        routeMetrics.distanceMeters,
        routeMetrics.durationSeconds,
      );

      const now = new Date();

      const fareRule = await this.lockApplicableFareRule(
        manager,
        originZone.id,
        now,
      );

      if (!fareRule) {
        throw new BadRequestException(
          'No existe una regla tarifaria activa para la zona de origen',
        );
      }

      const amounts = this.calculateAmounts(fareRule, routeMetrics, dto);

      const expiresAt = new Date(now.getTime() + FARE_QUOTE_TTL_MS);

      const quoteRepository = manager.getRepository(FareQuote);

      const quote = quoteRepository.create({
        passengerUserId,
        fareRuleId: fareRule.id,

        originZoneId: originZone.id,

        destinationZoneId: destinationZone.id,

        originPosition: {
          type: 'Point',
          coordinates: [dto.origin.longitude, dto.origin.latitude],
        },

        destinationPosition: {
          type: 'Point',
          coordinates: [dto.destination.longitude, dto.destination.latitude],
        },

        /*
         * origin: siempre resuelto por reverse geocoding — ya NO
         * confiamos en el literal que manda el cliente (p.ej.
         * "Ubicación actual del pasajero").
         *
         * destination: dirección real de autocomplete si el cliente
         * ya la mandó, o resuelta por reverse geocoding si el
         * cliente mandó el placeholder de selección manual.
         */
        originAddress,

        destinationAddress,

        /*
         * Métricas verificadas por
         * Google Routes.
         */
        distanceMeters: routeMetrics.distanceMeters,

        durationSeconds: routeMetrics.durationSeconds,

        baseFare: amounts.baseFare,

        distanceAmount: amounts.distanceAmount,

        timeAmount: amounts.timeAmount,

        bookingFee: amounts.bookingFee,

        pricingMinimumFare: fareRule.minimumFare,

        pricingPricePerKm: fareRule.pricePerKm,

        pricingPricePerMinute: fareRule.pricePerMinute,

        pricingCalculationVersion: 'fixed-decimal-v1',

        subtotal: amounts.subtotal,

        adjustmentMultiplier: amounts.adjustmentMultiplier,

        estimatedFare: amounts.estimatedFare,

        currency: fareRule.currency,

        isNight: dto.isNight === true,

        isRaining: dto.isRaining === true,

        status: FareQuoteStatus.ACTIVE,

        expiresAt,

        usedAt: null,
      });

      const savedQuote = await quoteRepository.save(quote);

      return {
        quoteId: savedQuote.id,

        quoteStatus: savedQuote.status,

        fareRuleId: fareRule.id,

        originZone: {
          id: originZone.id,

          name: originZone.name,

          code: originZone.code,
        },

        destinationZone: {
          id: destinationZone.id,

          name: destinationZone.name,

          code: destinationZone.code,
        },

        origin: {
          latitude: dto.origin.latitude,

          longitude: dto.origin.longitude,

          address: savedQuote.originAddress,
        },

        destination: {
          latitude: dto.destination.latitude,

          longitude: dto.destination.longitude,

          address: savedQuote.destinationAddress,
        },

        distanceMeters: savedQuote.distanceMeters,

        durationSeconds: savedQuote.durationSeconds,

        /*
         * Solo agregamos el campo cuando
         * Google realmente devolvió
         * una geometría válida.
         *
         * Esto mantiene compatibilidad
         * con mocks antiguos.
         */
        ...(routeMetrics.routePolyline
          ? {
              routePolyline: routeMetrics.routePolyline,
            }
          : {}),

        baseFare: savedQuote.baseFare,

        distanceAmount: savedQuote.distanceAmount,

        timeAmount: savedQuote.timeAmount,

        bookingFee: savedQuote.bookingFee,

        subtotal: savedQuote.subtotal,

        adjustmentMultiplier: savedQuote.adjustmentMultiplier,

        estimatedFare: savedQuote.estimatedFare,

        currency: savedQuote.currency,

        expiresAt: savedQuote.expiresAt,
      };
    });
  }

  private async lockPassenger(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', {
        userId,
      })
      .setLock('pessimistic_read')
      .getOne();

    if (!user) {
      throw new NotFoundException('El pasajero no existe');
    }

    return user;
  }

  private assertPassengerEnabled(user: User): void {
    if (
      user.status !== UserStatus.ACTIVE ||
      !user.roles.includes(UserRole.PASSENGER)
    ) {
      throw new ForbiddenException('La cuenta del pasajero no está habilitada');
    }
  }

  private findActiveZoneForPoint(
    manager: EntityManager,
    latitude: number,
    longitude: number,
  ): Promise<ServiceZone | null> {
    return manager
      .getRepository(ServiceZone)
      .createQueryBuilder('zone')
      .where('zone.status = :status', {
        status: ServiceZoneStatus.ACTIVE,
      })
      .andWhere(
        `ST_Covers(
          zone.boundary,
          ST_SetSRID(
            ST_MakePoint(:longitude, :latitude),
            4326
          )::geography
        )`,
        {
          latitude,
          longitude,
        },
      )
      .orderBy('zone.priority', 'DESC')
      .addOrderBy('zone.created_at', 'ASC')
      .setLock('pessimistic_read')
      .getOne();
  }

  private lockApplicableFareRule(
    manager: EntityManager,
    serviceZoneId: string,
    now: Date,
  ): Promise<FareRule | null> {
    return manager
      .getRepository(FareRule)
      .createQueryBuilder('rule')
      .where('rule.service_zone_id = :serviceZoneId', {
        serviceZoneId,
      })
      .andWhere('rule.status = :status', {
        status: FareRuleStatus.ACTIVE,
      })
      .andWhere('rule.effective_from <= :now', {
        now,
      })
      .andWhere(
        '(rule.effective_until IS NULL OR rule.effective_until > :now)',
        {
          now,
        },
      )
      .orderBy('rule.effective_from', 'DESC')
      .setLock('pessimistic_read')
      .getOne();
  }

  private calculateAmounts(
    fareRule: FareRule,
    routeMetrics: RouteMetrics,
    dto: EstimateFareDto,
  ): {
    baseFare: string;
    distanceAmount: string;
    timeAmount: string;
    bookingFee: string;
    subtotal: string;
    adjustmentMultiplier: string;
    estimatedFare: string;
  } {
    const baseFareCents = parseScaledDecimal(fareRule.baseFare, 2);

    const minimumFareCents = parseScaledDecimal(fareRule.minimumFare, 2);

    const bookingFeeCents = parseScaledDecimal(fareRule.bookingFee, 2);

    const distanceAmountCents = calculateDistanceAmountCents(
      fareRule.pricePerKm,
      routeMetrics.distanceMeters,
    );

    const timeAmountCents = calculateTimeAmountCents(
      fareRule.pricePerMinute,
      routeMetrics.durationSeconds,
    );

    const subtotalCents =
      baseFareCents + distanceAmountCents + timeAmountCents + bookingFeeCents;

    const multipliers: string[] = [];

    if (dto.isNight === true) {
      multipliers.push(fareRule.nightMultiplier);
    }

    if (dto.isRaining === true) {
      multipliers.push(fareRule.rainMultiplier);
    }

    const multiplierScaledThree = combineMultipliersScaledThree(multipliers);

    const adjustedCents = applyMultiplierToCents(
      subtotalCents,
      multiplierScaledThree,
    );

    const estimatedFareCents =
      adjustedCents > minimumFareCents ? adjustedCents : minimumFareCents;

    return {
      baseFare: formatCents(baseFareCents),

      distanceAmount: formatCents(distanceAmountCents),

      timeAmount: formatCents(timeAmountCents),

      bookingFee: formatCents(bookingFeeCents),

      subtotal: formatCents(subtotalCents),

      adjustmentMultiplier: formatScaledInteger(multiplierScaledThree, 3),

      estimatedFare: formatCents(estimatedFareCents),
    };
  }

  private assertRouteMetrics(
    distanceMeters: number,
    durationSeconds: number,
  ): void {
    if (
      !Number.isInteger(distanceMeters) ||
      distanceMeters < 1 ||
      distanceMeters > 100000
    ) {
      throw new BadRequestException(
        'La distancia debe estar entre 1 y 100000 metros',
      );
    }

    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 86400
    ) {
      throw new BadRequestException(
        'La duración debe estar entre 1 y 86400 segundos',
      );
    }
  }

  private assertDifferentPoints(dto: EstimateFareDto): void {
    if (
      dto.origin.latitude === dto.destination.latitude &&
      dto.origin.longitude === dto.destination.longitude
    ) {
      throw new BadRequestException(
        'El origen y el destino deben ser diferentes',
      );
    }
  }
}
