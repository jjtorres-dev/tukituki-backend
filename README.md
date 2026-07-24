# TukiTuki Backend

Backend NestJS para la plataforma de viajes en mototaxi TukiTuki. Centraliza pasajeros, conductores, viajes, seguridad, pagos, comisiones, liquidaciones, promociones y operaciones administrativas.

## Requisitos

- Node.js 22 y npm.
- PostgreSQL 18 con PostGIS.
- Redis 8.

Copia `.env.example` como `.env`, reemplaza todos los secretos y levanta las dependencias locales:

```bash
docker compose up -d
npm ci
npm run migration:run
npm run seed:development
npm run start:dev
```

El seed solo acepta `NODE_ENV=development` o `test`; nunca se ejecuta en producción.

## Verificación

```bash
npm run lint:check
npm test -- --runInBand
npm run build
npm run test:db:smoke
npm run test:e2e -- --runInBand
npm run openapi:export
```

El smoke de migraciones exige una base desechable y limpia cuyo nombre contenga `test` o `smoke`. `npm run test:db:smoke` aplica todas las migraciones y ejecuta dos veces el seed para comprobar que sea idempotente. Después, `npm run test:e2e` valida readiness HTTP y el flujo cotización → viaje → pago → comisión → liquidación.

Los contratos para Flutter se generan en `docs/openapi.json` y `docs/tukituki.postman_collection.json`.

## Operación y seguridad

- Liveness: `GET /api/v1/health/live`.
- Readiness (PostgreSQL y Redis): `GET /api/v1/health/ready`.
- Swagger: `/docs` cuando `SWAGGER_ENABLED=true`.
- CORS HTTP y WebSocket: lista separada por comas en `CORS_ALLOWED_ORIGINS`.
- Helmet, límite global de solicitudes y límite del cuerpo están habilitados.
- Cada respuesta incluye `X-Request-Id`; los logs pueden emitirse en JSON.
- `DATABASE_SSL_REJECT_UNAUTHORIZED=true` debe conservarse en producción; usa `DATABASE_SSL_CA_BASE64` cuando el proveedor entregue una CA privada.

No expongas PostgreSQL ni Redis públicamente. Configura TLS en el proxy inverso y guarda secretos en el gestor de secretos del proveedor, no en Git.

## Imagen y despliegue

Construcción local reproducible:

```bash
docker build --target production -t tukituki-backend:local .
```

Despliegue con Compose:

```bash
# Completa .env con valores de producción.
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm api npm run migration:run:prod
docker compose -f docker-compose.prod.yml up -d
```

Las migraciones son un paso explícito anterior al arranque; nunca se ejecutan automáticamente desde cada réplica. Para una imagen publicada en GHCR define `TUKITUKI_IMAGE=ghcr.io/<organizacion>/tukituki-backend:<tag>`.

GitHub Actions ejecuta lint, pruebas, migraciones sobre una base limpia, exportación de contratos y build Docker. El workflow de publicación solo crea imágenes GHCR en tags `v*` o por ejecución manual; no despliega ni toca una base de producción.
