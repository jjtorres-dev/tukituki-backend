import { PartialType } from '@nestjs/swagger';

import { CreatePassengerProfileDto } from './create-passenger-profile.dto';

export class UpdatePassengerProfileDto extends PartialType(
  CreatePassengerProfileDto,
) {}
