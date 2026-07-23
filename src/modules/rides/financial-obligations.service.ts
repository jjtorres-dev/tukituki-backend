import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { FinancialObligationQueryDto } from './dto/financial-obligation-query.dto';
import { FinancialObligationListResponseDto } from './dto/financial-obligation-response.dto';
import { UserFinancialObligation } from './entities/user-financial-obligation.entity';

@Injectable()
export class FinancialObligationsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    userId: string,
    query: FinancialObligationQueryDto,
  ): Promise<FinancialObligationListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const repository = this.dataSource.getRepository(UserFinancialObligation);
    const [rows, totalItems] = await repository.findAndCount({
      where: {
        userId,
        ...(query.status ? { status: query.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        rideId: row.rideId,
        obligationType: row.obligationType,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
      },
    };
  }
}
