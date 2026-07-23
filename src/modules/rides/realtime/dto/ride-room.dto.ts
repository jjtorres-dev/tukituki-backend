import { IsUUID } from 'class-validator';

export class RideRoomDto {
  @IsUUID()
  rideId!: string;
}
