import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { DigitalPaymentsService } from './digital-payments.service';
import {
  IzipayWebhookDto,
  IzipayWebhookResponseDto,
} from './dto/izipay-webhook.dto';

@ApiTags('Payment webhooks')
@Controller('payments/webhooks')
export class IzipayWebhookController {
  constructor(private readonly service: DigitalPaymentsService) {}

  @Post('izipay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recibir y verificar una notificación IPN firmada de Izipay',
  })
  @ApiHeader({ name: 'transactionId', required: true })
  @ApiOkResponse({ type: IzipayWebhookResponseDto })
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse({ description: 'Firma HMAC inválida' })
  @ApiNotFoundResponse()
  receive(
    @Headers('transactionid') transactionId: string | undefined,
    @Body() dto: IzipayWebhookDto,
  ): Promise<IzipayWebhookResponseDto> {
    return this.service.processIzipayWebhook(transactionId, dto);
  }
}
