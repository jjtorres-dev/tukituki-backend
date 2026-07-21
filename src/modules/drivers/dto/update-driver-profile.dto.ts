import { PartialType } from '@nestjs/swagger';

import { CreateDriverProfileDto } from './create-driver-profile.dto';

export class UpdateDriverProfileDto extends PartialType(
  CreateDriverProfileDto,
) {}
