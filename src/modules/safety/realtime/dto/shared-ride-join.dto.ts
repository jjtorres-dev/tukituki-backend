import { IsString, MaxLength, MinLength } from 'class-validator';

export class SharedRideJoinDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
