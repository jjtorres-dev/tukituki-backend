import type { DataSource } from 'typeorm';

interface AdvisoryLockRow {
  locked: boolean;
}

export interface RideAdvisoryLockResult<T> {
  acquired: boolean;
  result?: T;
}

/*
 * Advisory lock por ride (pg_try_advisory_lock(hashtext(rideId))),
 * compartido entre RideDispatchWorker (rondas) y el trigger de
 * late-join (G3A), para que nunca despachen la misma ride al mismo
 * tiempo.
 */
export async function withRideAdvisoryLock<T>(
  dataSource: DataSource,
  rideId: string,
  operation: () => Promise<T>,
): Promise<RideAdvisoryLockResult<T>> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const lockResult: unknown = await queryRunner.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS "locked"',
      [rideId],
    );
    const locked = Boolean((lockResult as AdvisoryLockRow[])[0]?.locked);

    if (!locked) {
      return { acquired: false };
    }

    try {
      const result = await operation();

      return { acquired: true, result };
    } finally {
      await queryRunner.query(
        'SELECT pg_advisory_unlock(hashtext($1)) AS "unlocked"',
        [rideId],
      );
    }
  } finally {
    await queryRunner.release();
  }
}
