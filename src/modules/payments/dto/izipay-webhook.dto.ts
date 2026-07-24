import {
  IsObject,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IzipayWebhookDto {
  @ApiProperty({ example: '00' })
  @IsString()
  @Length(2, 30)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  message!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  messageUser!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  messageUserEng!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiProperty({
    description: 'Payload original exacto utilizado para calcular la firma.',
  })
  @IsString()
  @MaxLength(100_000)
  payloadHttp!: string;

  @ApiProperty({ description: 'Firma HMAC-SHA256 codificada en Base64.' })
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  signature!: string;

  @ApiProperty()
  @IsString()
  @Length(5, 40)
  transactionId!: string;
}

export class IzipayWebhookResponseDto {
  @ApiProperty({ example: true })
  received!: boolean;
}
