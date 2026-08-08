import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import {
  PlacesAutocompleteDto,
  PlacesAutocompleteResponseDto,
} from './dto/places-autocomplete.dto';
import {
  PlaceDetailsQueryDto,
  PlaceDetailsResponseDto,
} from './dto/place-details.dto';
import { PlacesService } from './places.service';

@ApiTags('Places')
@ApiBearerAuth()
@Controller('places')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Post('autocomplete')
  @ApiOperation({
    summary: 'Buscar destinos mientras el pasajero escribe',
  })
  @ApiOkResponse({
    type: PlacesAutocompleteResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  @ApiServiceUnavailableResponse()
  autocomplete(
    @Body()
    dto: PlacesAutocompleteDto,
  ): Promise<PlacesAutocompleteResponseDto> {
    return this.placesService.autocomplete(dto);
  }

  @Get(':placeId')
  @ApiOperation({
    summary: 'Obtener coordenadas de un destino seleccionado',
  })
  @ApiOkResponse({
    type: PlaceDetailsResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiServiceUnavailableResponse()
  getDetails(
    @Param('placeId')
    placeId: string,

    @Query()
    query: PlaceDetailsQueryDto,
  ): Promise<PlaceDetailsResponseDto> {
    return this.placesService.getDetails(placeId, query);
  }
}
