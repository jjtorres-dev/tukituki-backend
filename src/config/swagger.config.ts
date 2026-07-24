import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export interface SwaggerConfigurationOptions {
  environment?: string;
  publicApiOrigin?: string;
}

export const SWAGGER_TAGS = [
  ['Health', 'Estado de la API y sus dependencias.'],
  ['Auth', 'Registro, autenticación y administración de sesiones.'],
  ['Passengers', 'Perfil del pasajero autenticado.'],
  ['Drivers', 'Perfil y postulación del conductor.'],
  ['Driver documents', 'Documentos de validación del conductor.'],
  ['Driver vehicles', 'Vehículo del conductor.'],
  ['Driver operations', 'Disponibilidad y estado operativo del conductor.'],
  ['Driver locations', 'Ubicación en tiempo real del conductor.'],
  ['Service zones', 'Consulta pública de zonas de cobertura.'],
  ['Admin service zones', 'Administración de zonas de cobertura.'],
  ['Fares', 'Cotización de tarifas para pasajeros.'],
  ['Admin fare rules', 'Administración de reglas tarifarias.'],
  ['Passenger rides', 'Solicitud y ciclo de vida de viajes del pasajero.'],
  ['Driver ride offers', 'Ofertas de viaje enviadas a conductores.'],
  ['Driver rides', 'Ciclo de vida de viajes del conductor.'],
  ['Admin rides', 'Consulta y seguimiento operativo de viajes.'],
  [
    'Admin ride cancellations',
    'Revisión administrativa de cancelaciones y no-show.',
  ],
  ['Financial obligations', 'Obligaciones financieras del usuario.'],
  ['Passenger cash payments', 'Pagos en efectivo vistos por el pasajero.'],
  ['Driver cash payments', 'Confirmación de efectivo por el conductor.'],
  ['Passenger digital payments', 'Inicio de pagos digitales del pasajero.'],
  ['Payment webhooks', 'Callbacks firmados de proveedores de pago.'],
  ['Admin cash payments', 'Conciliación administrativa de pagos.'],
  ['Driver commissions', 'Comisiones e ingresos del conductor.'],
  ['Admin commissions', 'Política y control de comisiones.'],
  ['Driver settlements', 'Liquidaciones del conductor.'],
  ['Admin driver settlements', 'Administración de liquidaciones.'],
  ['Passenger promotions', 'Validación de promociones y cupones.'],
  ['Admin promotions', 'Administración de promociones y cupones.'],
  ['Emergency contacts', 'Contactos de emergencia del usuario.'],
  ['Ride safety', 'SOS e incidentes de seguridad durante el viaje.'],
  ['Ride sharing', 'Enlaces privados para compartir un viaje.'],
  ['Public ride sharing', 'Vista pública limitada de un viaje compartido.'],
  ['Admin safety incidents', 'Gestión administrativa de incidentes.'],
  ['Devices and notifications', 'Dispositivos push y notificaciones.'],
  ['Operational metrics', 'Métricas operativas agregadas.'],
  [
    'Admin operational reports',
    'Dashboard, series temporales y exportes operativos.',
  ],
  ['Admin audit', 'Trazabilidad de acciones administrativas.'],
  ['Admin drivers', 'Revisión y administración de conductores.'],
] as const;

export function buildSwaggerConfiguration(
  options: SwaggerConfigurationOptions = {},
): Omit<OpenAPIObject, 'paths'> {
  const environment =
    options.environment ?? process.env.NODE_ENV ?? 'development';
  const publicApiOrigin = normalizeOrigin(
    options.publicApiOrigin ??
      process.env.PUBLIC_API_ORIGIN ??
      `http://localhost:${process.env.PORT ?? '3001'}`,
  );
  const builder = new DocumentBuilder()
    .setTitle('TukiTuki API')
    .setDescription(
      [
        'API REST del servicio de mototaxis TukiTuki para pasajeros,',
        'conductores, operaciones y administración.',
        'Los importes monetarios se expresan en soles (PEN). Las fechas usan',
        'ISO 8601 en UTC. Las rutas protegidas requieren un access token JWT.',
      ].join(' '),
    )
    .setVersion('1.0.0')
    .addServer(publicApiOrigin, `${environment} API`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token obtenido mediante /auth/login.',
      },
      'bearer',
    );

  for (const [name, description] of SWAGGER_TAGS) {
    builder.addTag(name, description);
  }
  return builder.build();
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildSwaggerConfiguration());
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}
