import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyPhoneOtpDto {
  @ApiProperty({
    example: '+51987654321',
  })
  @IsString()
  @Matches(/^\+519\d{8}$/, {
    message: 'El teléfono debe tener el formato +519XXXXXXXX',
  })
  phoneE164!: string;

  @ApiProperty({
    example: '482913',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El código OTP debe contener exactamente 6 dígitos',
  })
  code!: string;
}
