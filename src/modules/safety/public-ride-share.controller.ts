import { Controller, Get, Headers, Ip, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PublicSharedRideResponseDto } from './dto/public-shared-ride-response.dto';
import { RideShareLinksService } from './ride-share-links.service';

@ApiTags('Public ride sharing')
@Controller('public/rides/shared')
export class PublicRideShareController {
  constructor(private readonly service: RideShareLinksService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Consultar un viaje mediante un enlace compartido' })
  @ApiParam({ name: 'token', type: String })
  @ApiOkResponse({ type: PublicSharedRideResponseDto })
  @ApiNotFoundResponse({ description: 'Enlace inválido, vencido o revocado' })
  @ApiResponse({ status: 429, description: 'Límite de consultas excedido' })
  getSharedRide(
    @Param('token') token: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<PublicSharedRideResponseDto> {
    return this.service.getPublic(token, ip, userAgent);
  }
}
