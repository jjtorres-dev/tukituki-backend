import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { RideOffer } from '../rides/entities/ride-offer.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideOfferStatus } from '../rides/enums/ride-offer-status.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateNotificationInput } from '../notifications/interfaces/create-notification.interface';
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
        await this.notifyParticipants(
          event,
          NotificationType.RIDE_CANCELLED,
          'Viaje cancelado',
          'El viaje fue cancelado.',
        );
        return;
      case OutboxEventType.RIDE_EXPIRED:
        await this.notifyPassenger(
          event,
          NotificationType.RIDE_EXPIRED,
          'No encontramos conductor',
          'La búsqueda venció. Puedes solicitar un nuevo viaje.',
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
    const participants = this.participantUserIds(ride);

    for (const userId of participants) {
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
        data: {
          route: 'ride-rating',
          rideId: ride.id,
        },
        dedupeKey: `${event.id}:${userId}:rating-request`,
      });
    }
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
}
