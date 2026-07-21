import { PublicUserDto } from './register-response.dto';
export declare class LoginResponseDto {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
    user: PublicUserDto;
}
