import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CheckServiceZonePointDto } from './dto/check-service-zone-point.dto';
import { CheckServiceZonePointResponseDto } from './dto/service-zone-response.dto';
import { ServiceZonesService } from './service-zones.service';

@ApiTags('Service zones')
@Controller('service-zones')
export class ServiceZonesController {
  constructor(private readonly serviceZonesService: ServiceZonesService) {}

  @Post('check-point')
  @ApiOperation({
    summary: 'Validar si una coordenada está dentro de cobertura',
  })
  @ApiOkResponse({
    type: CheckServiceZonePointResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Las coordenadas no son válidas',
  })
  checkPoint(
    @Body()
    dto: CheckServiceZonePointDto,
  ): Promise<CheckServiceZonePointResponseDto> {
    return this.serviceZonesService.checkPoint(dto);
  }
}
