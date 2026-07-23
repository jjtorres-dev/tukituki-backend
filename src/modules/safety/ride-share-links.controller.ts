import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateRideShareLinkDto } from './dto/create-ride-share-link.dto';
import { RideShareLinkResponseDto } from './dto/ride-share-link-response.dto';
import { RideShareLinksService } from './ride-share-links.service';

@ApiTags('Ride sharing')
@ApiBearerAuth()
@Controller('rides/:rideId/share-links')
@UseGuards(JwtAuthGuard)
export class RideShareLinksController {
  constructor(private readonly service: RideShareLinksService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un enlace seguro para compartir el viaje' })
  @ApiCreatedResponse({ type: RideShareLinkResponseDto })
  @ApiForbiddenResponse()
  @ApiConflictResponse()
  @ApiNotFoundResponse()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: CreateRideShareLinkDto,
  ): Promise<RideShareLinkResponseDto> {
    return this.service.create(user.id, rideId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar enlaces creados por el usuario' })
  @ApiOkResponse({ type: [RideShareLinkResponseDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideShareLinkResponseDto[]> {
    return this.service.list(user.id, rideId);
  }

  @Delete(':shareLinkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revocar un enlace compartido' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Param('shareLinkId', ParseUUIDPipe) shareLinkId: string,
  ): Promise<void> {
    return this.service.revoke(user.id, rideId, shareLinkId);
  }
}
