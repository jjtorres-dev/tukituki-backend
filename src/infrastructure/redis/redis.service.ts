import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

export interface RedisGeoSearchResult {
  member: string;
  distanceMeters: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private readonly client: ReturnType<typeof createClient>;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();

    if (redisUrl) {
      this.client = createClient({
        url: redisUrl,
      });
    } else {
      const host = this.configService.getOrThrow<string>('REDIS_HOST');
      const port = this.configService.getOrThrow<number>('REDIS_PORT');

      this.client = createClient({
        url: `redis://${host}:${port}`,
      });
    }

    this.client.on('error', (error: unknown) => {
      this.logger.error('Error de conexión con Redis', error);
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }

    this.logger.log('Conexión con Redis establecida');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  ping(): Promise<string> {
    return this.client.ping();
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, value, {
      EX: ttlSeconds,
    });
  }

  /*
   * SET ... EX ... GET de una sola instrucción (Redis >= 6.2, ya
   * requerido por GEOSEARCH en este mismo servicio): siempre
   * escribe la key y renueva su TTL, y devuelve atómicamente el
   * valor ANTERIOR (o null si no existía). Permite implementar un
   * "lease" que se renueva en cada llamada sin dejar de poder
   * distinguir, en la misma instrucción, si la key ya existía —
   * sin carrera posible incluso con múltiples instancias de
   * Backend concurrentes.
   */
  async setWithTtlReturningPrevious(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<string | null> {
    const previous = await this.client.set(key, value, {
      expiration: {
        type: 'EX',
        value: ttlSeconds,
      },
      GET: true,
    });

    return previous;
  }

  async addToSet(key: string, member: string): Promise<void> {
    await this.client.sAdd(key, member);
  }

  async popFromSet(key: string, count: number): Promise<string[]> {
    return this.client.sPopCount(key, count);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const result: unknown = await this.client.sendCommand([
      'EVAL',
      [
        "local current = redis.call('INCR', KEYS[1])",
        "if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
        'return current',
      ].join('\n'),
      '1',
      key,
      ttlSeconds.toString(),
    ]);

    const value = Number(result);

    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error('Redis devolvió un contador inválido');
    }

    return value;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async geoAdd(
    key: string,
    longitude: number,
    latitude: number,
    member: string,
  ): Promise<void> {
    await this.client.sendCommand([
      'GEOADD',
      key,
      longitude.toString(),
      latitude.toString(),
      member,
    ]);
  }

  async geoRemove(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) {
      return;
    }

    await this.client.sendCommand(['ZREM', key, ...members]);
  }

  async geoSearchByRadius(
    key: string,
    longitude: number,
    latitude: number,
    radiusMeters: number,
    count: number,
  ): Promise<RedisGeoSearchResult[]> {
    const response: unknown = await this.client.sendCommand([
      'GEOSEARCH',
      key,
      'FROMLONLAT',
      longitude.toString(),
      latitude.toString(),
      'BYRADIUS',
      radiusMeters.toString(),
      'M',
      'ASC',
      'COUNT',
      count.toString(),
      'WITHDIST',
    ]);

    if (!Array.isArray(response)) {
      return [];
    }

    const results: RedisGeoSearchResult[] = [];

    for (const item of response) {
      if (!Array.isArray(item) || item.length < 2) {
        continue;
      }

      const member = this.redisValueToString(item[0]);
      const distanceValue = this.redisValueToString(item[1]);

      if (!member || !distanceValue) {
        continue;
      }

      const distanceMeters = Number(distanceValue);

      if (!Number.isFinite(distanceMeters)) {
        continue;
      }

      results.push({
        member,
        distanceMeters,
      });
    }

    return results;
  }

  private redisValueToString(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('utf8');
    }

    return null;
  }
}
