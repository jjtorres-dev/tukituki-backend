export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

export function createDatabaseSslOptions(
  enabled: boolean,
  rejectUnauthorized: boolean,
  caBase64?: string,
): false | DatabaseSslOptions {
  if (!enabled) {
    return false;
  }

  const ca = caBase64?.trim()
    ? Buffer.from(caBase64, 'base64').toString('utf8')
    : undefined;

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
  };
}
