import type { QueryRunner } from 'typeorm';

import { EnableDatabaseExtensions1784580000000 } from './1784580000000-EnableDatabaseExtensions';

describe('EnableDatabaseExtensions1784580000000', () => {
  it('habilita uuid-ossp y PostGIS de forma idempotente', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await new EnableDatabaseExtensions1784580000000().up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public',
    );
  });

  it('no elimina extensiones compartidas al revertir', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await new EnableDatabaseExtensions1784580000000().down(queryRunner);

    expect(query).not.toHaveBeenCalled();
  });
});
