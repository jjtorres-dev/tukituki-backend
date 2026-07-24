import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Namespace } from 'socket.io';

import { websocketCorsOrigin } from '../../../config/cors.config';

import type { AuthenticatedSocket } from './authenticated-socket.interface';
import { RideRealtimeAccessService } from './ride-realtime-access.service';
import { RideRoomDto } from './dto/ride-room.dto';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';

@WebSocketGateway({
  namespace: '/rides',
  cors: {
    origin: websocketCorsOrigin,
    credentials: true,
  },
})
@UseGuards(WsJwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class RidesGateway {
  @WebSocketServer()
  private server!: Namespace;

  constructor(private readonly accessService: RideRealtimeAccessService) {}

  @SubscribeMessage('ride.join')
  async joinRide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: RideRoomDto,
  ): Promise<{ event: string; data: { rideId: string } }> {
    const user = client.data.user;

    if (!user) {
      throw new WsException('El usuario WebSocket no está autenticado');
    }

    await this.accessService.assertParticipant(user, dto.rideId);
    await client.join(this.room(dto.rideId));

    return {
      event: 'ride.joined',
      data: { rideId: dto.rideId },
    };
  }

  @SubscribeMessage('ride.leave')
  async leaveRide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: RideRoomDto,
  ): Promise<{ event: string; data: { rideId: string } }> {
    await client.leave(this.room(dto.rideId));

    return {
      event: 'ride.left',
      data: { rideId: dto.rideId },
    };
  }

  emitToRide(rideId: string, event: string, payload: unknown): void {
    this.server.to(this.room(rideId)).emit(event, payload);
  }

  private room(rideId: string): string {
    return `ride:${rideId}`;
  }
}
