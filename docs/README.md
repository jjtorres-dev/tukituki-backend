# Contratos de la API TukiTuki

Los clientes Flutter y el panel administrativo deben usar el documento OpenAPI
generado desde los decoradores del backend como fuente de verdad.

## Exportar

Con PostgreSQL y Redis disponibles y las variables de entorno configuradas:

```powershell
npx ts-node scripts/export-openapi.ts
```

El comando valida tags, resúmenes, identificadores de operación y esquemas de
seguridad antes de escribir:

- `docs/openapi.json`, importable en generadores de clientes OpenAPI.
- `docs/tukituki.postman_collection.json`, importable directamente en Postman.

La colección define `baseUrl` desde `PUBLIC_API_ORIGIN` y deja `accessToken`
vacío. Después de iniciar sesión, se debe asignar el JWT a esa variable. Las
rutas públicas se exportan con `noauth`.

## Comando npm

```powershell
npm run openapi:export
```

CI vuelve a exportar y validar los contratos en cada cambio.
