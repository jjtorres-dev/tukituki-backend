import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RequestPhoneOtpDto {
  @ApiProperty({
    example: '+51987654321',
  })
  @IsString()
  @Matches(/^\+519\d{8}$/, {
    message: 'El teléfono debe tener el formato +519XXXXXXXX',
  })
  phoneE164!: string;
}
