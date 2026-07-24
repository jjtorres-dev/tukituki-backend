import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import { websocketCorsOrigin } from '../../../config/cors.config';

import { SharedRideJoinDto } from './dto/shared-ride-join.dto';
import { SharedRideAccessService } from './shared-ride-access.service';

@WebSocketGateway({
  namespace: '/shared-rides',
  cors: { origin: websocketCorsOrigin, credentials: false },
})
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class SharedRidesGateway {
  @WebSocketServer()
  private server!: Namespace;

  constructor(private readonly accessService: SharedRideAccessService) {}

  @SubscribeMessage('shared.join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SharedRideJoinDto,
  ): Promise<{
    event: string;
    data: { shareLinkId: string; rideStatus: string };
  }> {
    try {
      const userAgent = client.handshake.headers['user-agent'];
      const link = await this.accessService.validateAndRecord(
        dto.token,
        client.handshake.address,
        typeof userAgent === 'string' ? userAgent : undefined,
      );
      await client.join(this.room(link.id));
      return {
        event: 'shared.joined',
        data: { shareLinkId: link.id, rideStatus: link.ride.status },
      };
    } catch (error: unknown) {
      throw new WsException(
        error instanceof Error ? error.message : 'Enlace compartido inválido',
      );
    }
  }

  emitToLink(shareLinkId: string, event: string, payload: unknown): void {
    this.server.to(this.room(shareLinkId)).emit(event, payload);
  }

  private room(shareLinkId: string): string {
    return `share:${shareLinkId}`;
  }
}
