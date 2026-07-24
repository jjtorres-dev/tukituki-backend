type CorsCallback = (error: Error | null, allow?: boolean) => void;

export function parseCorsOrigins(
  configured: string | undefined,
  fallback?: string,
): string[] {
  const origins = (configured ?? fallback ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set(origins)];
}

export function websocketCorsOrigin(
  origin: string | undefined,
  callback: CorsCallback,
): void {
  // Flutter y otros clientes nativos no envían el encabezado Origin.
  if (!origin) {
    callback(null, true);
    return;
  }

  const allowedOrigins = parseCorsOrigins(
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.ADMIN_WEB_ORIGIN,
  );

  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Origen WebSocket no permitido'));
}
