import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { FinancialObligationStatus } from '../enums/financial-obligation-status.enum';
import { FinancialObligationType } from '../enums/financial-obligation-type.enum';

export class FinancialObligationItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: FinancialObligationType })
  obligationType!: FinancialObligationType;

  @ApiProperty({ example: '2.00' })
  amount!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ enum: FinancialObligationStatus })
  status!: FinancialObligationStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class FinancialObligationPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class FinancialObligationListResponseDto {
  @ApiProperty({ type: [FinancialObligationItemDto] })
  items!: FinancialObligationItemDto[];

  @ApiProperty({ type: FinancialObligationPaginationDto })
  pagination!: FinancialObligationPaginationDto;
}
