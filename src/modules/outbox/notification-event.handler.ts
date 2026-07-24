import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateNotificationInput } from '../notifications/interfaces/create-notification.interface';
import { RideOffer } from '../rides/entities/ride-offer.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideOfferStatus } from '../rides/enums/ride-offer-status.enum';
import { EmergencyContactAlert } from '../safety/entities/emergency-contact-alert.entity';
import { EmergencyContact } from '../safety/entities/emergency-contact.entity';
import { RideSafetyIncident } from '../safety/entities/ride-safety-incident.entity';
import { EmergencyContactAlertStatus } from '../safety/enums/emergency-contact-alert-status.enum';
import { User } from '../users/entities/user.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventType } from './enums/outbox-event-type.enum';

@Injectable()
export class NotificationEventHandler {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case OutboxEventType.RIDE_REQUESTED:
        return;
      case OutboxEventType.RIDE_OFFER_CREATED:
        await this.handleOffer(event);
        return;
      case OutboxEventType.RIDE_ASSIGNED:
        await this.notifyPassenger(
          event,
          NotificationType.RIDE_ASSIGNED,
          'Conductor asignado',
          'Un conductor aceptó tu solicitud y se prepara para ir al origen.',
        );
        return;
      case OutboxEventType.DRIVER_ARRIVING:
        await this.notifyPassenger(
          event,
          NotificationType.DRIVER_ARRIVING,
          'Conductor en camino',
          'Tu conductor ya se dirige al punto de origen.',
        );
        return;
      case OutboxEventType.DRIVER_ARRIVED:
        await this.notifyPassenger(
          event,
          NotificationType.DRIVER_ARRIVED,
          'Tu conductor llegó',
          'El conductor está cerca del origen. Revisa el PIN antes de abordar.',
        );
        return;
      case OutboxEventType.RIDE_STARTED:
        await this.notifyParticipants(
          event,
          NotificationType.RIDE_STARTED,
          'Viaje iniciado',
          'El recorrido fue iniciado correctamente.',
        );
        return;
      case OutboxEventType.RIDE_COMPLETED:
        await this.handleCompleted(event);
        return;
      case OutboxEventType.RIDE_CANCELLED:
        if (!this.isAdvancedCancellation(event.payload)) {
          await this.notifyParticipants(
            event,
            NotificationType.RIDE_CANCELLED,
            'Viaje cancelado',
            'El viaje fue cancelado.',
          );
        }
        return;
      case OutboxEventType.RIDE_EXPIRED:
        await this.notifyPassenger(
          event,
          NotificationType.RIDE_EXPIRED,
          'No encontramos conductor',
          'La búsqueda venció. Puedes solicitar un nuevo viaje.',
        );
        return;
      case OutboxEventType.PASSENGER_WAITING_STARTED:
        await this.notifyPayloadUser(
          event,
          'passengerUserId',
          NotificationType.PASSENGER_WAITING,
          'El conductor está esperando',
          'Tu conductor inició la espera en el punto de origen.',
        );
        return;
      case OutboxEventType.RIDE_CANCELLED_BY_PASSENGER:
        await this.handlePassengerCancellation(event);
        return;
      case OutboxEventType.RIDE_CANCELLED_BY_DRIVER:
        await this.handleDriverCancellation(event);
        return;
      case OutboxEventType.PASSENGER_NO_SHOW_CONFIRMED:
        await this.handlePassengerNoShow(event);
        return;
      case OutboxEventType.DRIVER_NO_SHOW_CONFIRMED:
        await this.handleDriverNoShow(event);
        return;
      case OutboxEventType.CANCELLATION_FEE_CREATED:
        await this.notifyPayloadUser(
          event,
          'userId',
          NotificationType.CANCELLATION_FEE,
          'Tarifa de cancelación registrada',
          this.feeBody(event.payload),
        );
        return;
      case OutboxEventType.CANCELLATION_FEE_WAIVED:
        await this.notifyPayloadUser(
          event,
          'passengerUserId',
          NotificationType.CANCELLATION_FEE_WAIVED,
          'Tarifa exonerada',
          'La tarifa de cancelación fue exonerada por soporte.',
        );
        return;
      case OutboxEventType.DRIVER_RELEASED:
        await this.notifyPayloadUser(
          event,
          'driverUserId',
          NotificationType.DRIVER_RELEASED,
          'Ya puedes recibir viajes',
          'El viaje terminó y tu disponibilidad fue restaurada.',
        );
        return;
      case OutboxEventType.RIDE_REMATCH_REQUESTED:
        await this.notifyPayloadUser(
          event,
          'passengerUserId',
          NotificationType.RIDE_REMATCHED,
          'Buscando otro conductor',
          'Reiniciamos la búsqueda porque el conductor anterior no mostró progreso.',
        );
        return;
      case OutboxEventType.SAFETY_INCIDENT_CREATED:
      case OutboxEventType.CASH_PAYMENT_CONFIRMED:
        await this.notifyPayloadUser(
          event,
          'passengerUserId',
          NotificationType.CASH_PAYMENT_CONFIRMED,
          'Pago en efectivo confirmado',
          'El conductor confirm? la recepci?n del efectivo y registr? el vuelto.',
        );
        return;
      case OutboxEventType.CASH_PAYMENT_DISPUTED:
        await this.notifyPayloadUser(
          event,
          'driverUserId',
          NotificationType.CASH_PAYMENT_DISPUTED,
          'Pago en efectivo observado',
          'El pasajero report? una discrepancia y soporte revisar? el pago.',
        );
        return;
      case OutboxEventType.CASH_PAYMENT_RESOLVED:
        await this.notifyParticipants(
          event,
          NotificationType.CASH_PAYMENT_RESOLVED,
          'Disputa de pago resuelta',
          'Soporte resolvi? la discrepancia del pago en efectivo.',
        );
        return;
        await this.handleSafetyIncidentCreated(event);
        return;
      case OutboxEventType.EMERGENCY_CONTACT_NOTIFICATION_REQUESTED:
        await this.handleEmergencyContactNotifications(event);
        return;
      case OutboxEventType.SAFETY_INCIDENT_ACKNOWLEDGED:
        await this.handleSafetyIncidentStatus(
          event,
          NotificationType.SAFETY_INCIDENT_ACKNOWLEDGED,
          'Incidente reconocido',
          'El equipo de soporte reconoció el incidente y está revisándolo.',
        );
        return;
      case OutboxEventType.SAFETY_INCIDENT_RESOLVED:
        await this.handleSafetyIncidentStatus(
          event,
          NotificationType.SAFETY_INCIDENT_RESOLVED,
          'Incidente actualizado',
          'El equipo de soporte cerró el incidente de seguridad.',
        );
        return;
      case OutboxEventType.RIDE_SHARE_LINK_CREATED:
        await this.handleRideShareLink(
          event,
          'Enlace de viaje creado',
          'El enlace para compartir tu viaje fue creado correctamente.',
        );
        return;
      case OutboxEventType.RIDE_SHARE_LINK_REVOKED:
        await this.handleRideShareLink(
          event,
          'Enlace de viaje revocado',
          'El enlace compartido dejó de estar disponible.',
        );
        return;
    }
  }

  private async handleOffer(event: OutboxEvent): Promise<void> {
    const offer = await this.dataSource.getRepository(RideOffer).findOne({
      where: { id: event.aggregateId },
      relations: { ride: true, driverProfile: true },
    });
    if (!offer) {
      throw new NotFoundException('La oferta del evento no existe');
    }
    if (
      offer.status !== RideOfferStatus.OFFERED ||
      offer.expiresAt.getTime() <= Date.now()
    ) {
      return;
    }
    await this.notificationsService.createAndDeliver({
      userId: offer.driverProfile.userId,
      type: NotificationType.RIDE_OFFER,
      title: 'Nueva solicitud de viaje',
      body: `Destino: ${offer.ride.destinationAddress}`,
      data: {
        route: 'ride-offer',
        offerId: offer.id,
        rideId: offer.rideId,
        expiresAt: offer.expiresAt.toISOString(),
      },
      dedupeKey: `${event.id}:${offer.driverProfile.userId}:ride-offer`,
    });
  }

  private async handleCompleted(event: OutboxEvent): Promise<void> {
    const ride = await this.loadRide(event.aggregateId);
    for (const userId of this.participantUserIds(ride)) {
      await this.notificationsService.createAndDeliver({
        userId,
        type: NotificationType.RIDE_COMPLETED,
        title: 'Viaje completado',
        body: `El viaje finalizó. Tarifa: ${ride.currency} ${ride.finalFare ?? ride.estimatedFare}.`,
        data: {
          route: 'ride-receipt',
          rideId: ride.id,
          status: ride.status,
        },
        dedupeKey: `${event.id}:${userId}:ride-completed`,
      });
      await this.notificationsService.createAndDeliver({
        userId,
        type: NotificationType.RATING_REQUEST,
        title: 'Califica tu viaje',
        body: 'Tu opinión ayuda a mantener una comunidad segura y confiable.',
        data: { route: 'ride-rating', rideId: ride.id },
        dedupeKey: `${event.id}:${userId}:rating-request`,
      });
    }
  }

  private async handlePassengerCancellation(event: OutboxEvent): Promise<void> {
    const passengerUserId = this.payloadString(
      event.payload,
      'passengerUserId',
    );
    const driverUserId = this.payloadString(event.payload, 'driverUserId');
    if (passengerUserId) {
      await this.createPayloadNotification(
        event,
        passengerUserId,
        NotificationType.RIDE_CANCELLED,
        'Viaje cancelado',
        'La cancelación fue registrada correctamente.',
      );
    }
    if (driverUserId) {
      await this.createPayloadNotification(
        event,
        driverUserId,
        NotificationType.RIDE_CANCELLED,
        'El pasajero canceló',
        'El pasajero canceló el viaje. Ya puedes recibir nuevas solicitudes.',
      );
    }
  }

  private async handleDriverCancellation(event: OutboxEvent): Promise<void> {
    await this.notifyPayloadUser(
      event,
      'passengerUserId',
      NotificationType.RIDE_CANCELLED,
      'El conductor canceló',
      'El conductor canceló el viaje. No se registró una tarifa para ti.',
    );
  }

  private async handlePassengerNoShow(event: OutboxEvent): Promise<void> {
    await this.notifyPayloadUser(
      event,
      'passengerUserId',
      NotificationType.PASSENGER_NO_SHOW,
      'No-show registrado',
      'El conductor confirmó que esperó en el origen y no pudo encontrarte.',
    );
    const driverUserId = this.payloadString(event.payload, 'driverUserId');
    if (driverUserId) {
      await this.createPayloadNotification(
        event,
        driverUserId,
        NotificationType.PASSENGER_NO_SHOW,
        'No-show confirmado',
        'El no-show fue registrado y tu disponibilidad fue restaurada.',
      );
    }
  }

  private async handleDriverNoShow(event: OutboxEvent): Promise<void> {
    const rematching = event.payload.rematching === true;
    await this.notifyPayloadUser(
      event,
      'passengerUserId',
      NotificationType.DRIVER_NO_SHOW,
      rematching ? 'Buscando otro conductor' : 'Viaje cancelado',
      rematching
        ? 'Confirmamos la falta de progreso y reiniciamos la búsqueda.'
        : 'Confirmamos la falta de progreso y cancelamos el viaje sin tarifa.',
    );
  }

  private async handleSafetyIncidentCreated(event: OutboxEvent): Promise<void> {
    const incident = await this.loadSafetyIncident(event.aggregateId);
    const participantIds = this.participantUserIds(incident.ride);
    const adminIds = await this.adminUserIds();
    const userIds = [...new Set([...participantIds, ...adminIds])];

    for (const userId of userIds) {
      await this.notificationsService.createAndDeliver({
        userId,
        type: NotificationType.SAFETY_INCIDENT,
        title:
          userId === incident.reporterUserId
            ? 'SOS activado'
            : 'Alerta de seguridad',
        body:
          userId === incident.reporterUserId
            ? 'Registramos tu alerta y notificamos al equipo de soporte.'
            : `Se registró un incidente ${incident.severity} durante un viaje.`,
        data: {
          route: 'safety-incident',
          incidentId: incident.id,
          rideId: incident.rideId,
          severity: incident.severity,
        },
        dedupeKey: `${event.id}:${userId}:safety-incident`,
      });
    }
  }

  private async handleEmergencyContactNotifications(
    event: OutboxEvent,
  ): Promise<void> {
    const incident = await this.loadSafetyIncident(event.aggregateId);
    const contacts = await this.dataSource
      .getRepository(EmergencyContact)
      .find({
        where: { userId: incident.reporterUserId },
        order: { isPrimary: 'DESC', createdAt: 'ASC' },
      });
    const alertRepository = this.dataSource.getRepository(
      EmergencyContactAlert,
    );
    const userRepository = this.dataSource.getRepository(User);

    for (const contact of contacts) {
      let alert = await alertRepository.findOne({
        where: { incidentId: incident.id, contactId: contact.id },
      });
      if (!alert) {
        const matchedUser = await userRepository.findOne({
          where: { phoneE164: contact.phoneE164 },
        });
        alert = await alertRepository.save(
          alertRepository.create({
            incidentId: incident.id,
            contactId: contact.id,
            contactName: contact.name,
            contactPhoneE164: contact.phoneE164,
            matchedUserId:
              matchedUser && matchedUser.id !== incident.reporterUserId
                ? matchedUser.id
                : null,
            status: EmergencyContactAlertStatus.PENDING_EXTERNAL_PROVIDER,
            deliveryAttempts: 0,
            deliveredAt: null,
            lastError: null,
          }),
        );
      }

      if (
        alert.matchedUserId &&
        alert.status !== EmergencyContactAlertStatus.IN_APP_DELIVERED
      ) {
        await this.notificationsService.createAndDeliver({
          userId: alert.matchedUserId,
          type: NotificationType.EMERGENCY_CONTACT_ALERT,
          title: 'Alerta de un contacto de emergencia',
          body: `${contact.name} fue registrado como contacto de emergencia y se activó una alerta durante un viaje.`,
          data: {
            route: 'emergency-contact-alert',
            incidentId: incident.id,
            rideId: incident.rideId,
          },
          dedupeKey: `${event.id}:${alert.matchedUserId}:emergency-contact`,
        });
        alert.status = EmergencyContactAlertStatus.IN_APP_DELIVERED;
        alert.deliveryAttempts += 1;
        alert.deliveredAt = new Date();
        alert.lastError = null;
        await alertRepository.save(alert);
      }
    }
  }

  private async handleRideShareLink(
    event: OutboxEvent,
    title: string,
    body: string,
  ): Promise<void> {
    const userId = this.payloadString(event.payload, 'createdByUserId');
    const rideId = this.payloadString(event.payload, 'rideId');
    if (!userId || !rideId) return;
    await this.notificationsService.createAndDeliver({
      userId,
      type: NotificationType.RIDE_SHARE_LINK,
      title,
      body,
      data: {
        route: 'ride-share-links',
        rideId,
        shareLinkId: event.aggregateId,
      },
      dedupeKey: `${event.id}:${userId}:ride-share-link`,
    });
  }

  private async handleSafetyIncidentStatus(
    event: OutboxEvent,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    const incident = await this.loadSafetyIncident(event.aggregateId);
    for (const userId of this.participantUserIds(incident.ride)) {
      await this.notificationsService.createAndDeliver({
        userId,
        type,
        title,
        body,
        data: {
          route: 'safety-incident',
          incidentId: incident.id,
          rideId: incident.rideId,
          status: incident.status,
        },
        dedupeKey: `${event.id}:${userId}:${type}`,
      });
    }
  }

  private async loadSafetyIncident(
    incidentId: string,
  ): Promise<RideSafetyIncident> {
    const incident = await this.dataSource
      .getRepository(RideSafetyIncident)
      .findOne({
        where: { id: incidentId },
        relations: { ride: { driverProfile: true } },
      });
    if (!incident) {
      throw new NotFoundException('El incidente del evento no existe');
    }
    return incident;
  }

  private async adminUserIds(): Promise<string[]> {
    const raw: unknown = await this.dataSource.query(
      `SELECT id FROM users
       WHERE deleted_at IS NULL
         AND roles && ARRAY['ADMIN', 'SUPER_ADMIN']::user_role_enum[]`,
    );
    return (raw as Array<{ id: string }>).map((row) => row.id);
  }

  private async notifyPassenger(
    event: OutboxEvent,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    const ride = await this.loadRide(event.aggregateId);
    await this.createRideNotification(
      event,
      ride.passengerUserId,
      type,
      title,
      body,
    );
  }

  private async notifyParticipants(
    event: OutboxEvent,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    const ride = await this.loadRide(event.aggregateId);
    for (const userId of this.participantUserIds(ride)) {
      await this.createRideNotification(event, userId, type, title, body);
    }
  }

  private async notifyPayloadUser(
    event: OutboxEvent,
    key: string,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    const userId = this.payloadString(event.payload, key);
    if (!userId) return;
    await this.createPayloadNotification(event, userId, type, title, body);
  }

  private createPayloadNotification(
    event: OutboxEvent,
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
  ): ReturnType<NotificationsService['createAndDeliver']> {
    return this.notificationsService.createAndDeliver({
      userId,
      type,
      title,
      body,
      data: {
        route: 'ride-detail',
        rideId: event.aggregateId,
        eventType: event.eventType,
      },
      dedupeKey: `${event.id}:${userId}:${type}`,
    });
  }

  private createRideNotification(
    event: OutboxEvent,
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
  ): ReturnType<NotificationsService['createAndDeliver']> {
    const input: CreateNotificationInput = {
      userId,
      type,
      title,
      body,
      data: {
        route: 'ride-detail',
        rideId: event.aggregateId,
        eventType: event.eventType,
      },
      dedupeKey: `${event.id}:${userId}:${type}`,
    };
    return this.notificationsService.createAndDeliver(input);
  }

  private async loadRide(rideId: string): Promise<Ride> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: { id: rideId },
      relations: { driverProfile: true },
    });
    if (!ride) {
      throw new NotFoundException('El viaje del evento no existe');
    }
    return ride;
  }

  private participantUserIds(ride: Ride): string[] {
    const users = [ride.passengerUserId];
    if (ride.driverProfile?.userId) users.push(ride.driverProfile.userId);
    return [...new Set(users)];
  }

  private payloadString(
    payload: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = payload[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private feeBody(payload: Record<string, unknown>): string {
    const amount = this.payloadString(payload, 'amount') ?? '0.00';
    const currency = this.payloadString(payload, 'currency') ?? 'PEN';
    return `Se registró una obligación pendiente de ${currency} ${amount}.`;
  }

  private isAdvancedCancellation(payload: Record<string, unknown>): boolean {
    const metadata = payload.metadata;
    if (
      metadata === null ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata)
    ) {
      return false;
    }
    return (metadata as Record<string, unknown>).advancedCancellation === true;
  }
}
