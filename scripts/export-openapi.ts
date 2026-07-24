import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';

type ReferenceObject = { $ref: string };
type OperationObject = NonNullable<OpenAPIObject['paths'][string]['get']>;
type ParameterObject = Exclude<
  NonNullable<OperationObject['parameters']>[number],
  ReferenceObject
>;
type ComponentsObject = NonNullable<OpenAPIObject['components']>;
type SchemaObject = Exclude<
  NonNullable<ComponentsObject['schemas']>[string],
  ReferenceObject
>;

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { createSwaggerDocument } from '../src/config/swagger.config';

interface PostmanCollection {
  info: { name: string; description: string; schema: string };
  auth: {
    type: 'bearer';
    bearer: Array<{ key: string; value: string; type: 'string' }>;
  };
  variable: Array<{ key: string; value: string; type: 'string' }>;
  item: PostmanFolder[];
}

interface PostmanFolder {
  name: string;
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: Record<string, unknown>;
  response: [];
}

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
] as const;

async function exportApiContracts(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    configureApplication(app, { exposeSwagger: false });
    await app.init();

    const document = createSwaggerDocument(app);
    validateOpenApiDocument(document);
    const outputDirectory = resolve(process.cwd(), 'docs');

    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeJson(resolve(outputDirectory, 'openapi.json'), document),
      writeJson(
        resolve(outputDirectory, 'tukituki.postman_collection.json'),
        toPostmanCollection(document),
      ),
    ]);

    console.log(
      `Exported ${Object.keys(document.paths).length} API paths to ${outputDirectory}`,
    );
  } finally {
    await app.close();
  }
}

export function validateOpenApiDocument(document: OpenAPIObject): void {
  const errors: string[] = [];
  const operationIds = new Set<string>();
  const declaredTags = new Set(document.tags?.map((tag) => tag.name) ?? []);
  const bearerScheme = document.components?.securitySchemes?.bearer;

  if (!document.openapi.startsWith('3.')) {
    errors.push(`unsupported OpenAPI version: ${document.openapi}`);
  }
  if (Object.keys(document.paths).length === 0) {
    errors.push('the document has no paths');
  }
  if (!bearerScheme || '$ref' in bearerScheme) {
    errors.push('components.securitySchemes.bearer is missing');
  } else if (
    bearerScheme.type !== 'http' ||
    bearerScheme.scheme?.toLowerCase() !== 'bearer'
  ) {
    errors.push('the bearer security scheme is not HTTP Bearer');
  }

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      const context = `${method.toUpperCase()} ${path}`;
      if (!operation.summary?.trim()) errors.push(`${context} has no summary`);
      if (!operation.tags?.length) errors.push(`${context} has no tag`);
      for (const tag of operation.tags ?? []) {
        if (!declaredTags.has(tag)) {
          errors.push(`${context} uses undeclared tag "${tag}"`);
        }
      }
      if (!operation.operationId) {
        errors.push(`${context} has no operationId`);
      } else if (operationIds.has(operation.operationId)) {
        errors.push(`duplicate operationId "${operation.operationId}"`);
      } else {
        operationIds.add(operation.operationId);
      }
      for (const security of operation.security ?? []) {
        for (const scheme of Object.keys(security)) {
          if (!document.components?.securitySchemes?.[scheme]) {
            errors.push(`${context} uses unknown security scheme "${scheme}"`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid OpenAPI document:\n- ${errors.join('\n- ')}`);
  }
}

export function toPostmanCollection(
  document: OpenAPIObject,
): PostmanCollection {
  const folders = new Map<string, PostmanItem[]>();

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      const tag = operation.tags?.[0] ?? 'Other';
      const items = folders.get(tag) ?? [];
      items.push(toPostmanItem(document, path, method, operation));
      folders.set(tag, items);
    }
  }

  return {
    info: {
      name: document.info.title,
      description: document.info.description ?? '',
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
    },
    variable: [
      {
        key: 'baseUrl',
        value: document.servers?.[0]?.url ?? 'http://localhost:3001',
        type: 'string',
      },
      { key: 'accessToken', value: '', type: 'string' },
    ],
    item: [...folders.entries()].map(([name, item]) => ({ name, item })),
  };
}

function toPostmanItem(
  document: OpenAPIObject,
  path: string,
  method: (typeof HTTP_METHODS)[number],
  operation: OperationObject,
): PostmanItem {
  const parameters = (operation.parameters ?? [])
    .map((parameter) => resolveParameter(document, parameter))
    .filter((parameter): parameter is ParameterObject => Boolean(parameter));
  const query = parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => ({
      key: parameter.name,
      value: `{{${parameter.name}}}`,
      description: parameter.description,
      disabled: parameter.required !== true,
    }));
  const pathVariables = parameters
    .filter((parameter) => parameter.in === 'path')
    .map((parameter) => ({
      key: parameter.name,
      value: `{{${parameter.name}}}`,
      description: parameter.description,
    }));
  const postmanPath = path.replace(/{([^}]+)}/g, ':$1');
  const requestBody = resolveRequestBodySchema(document, operation);
  const secured = operation.security?.some((requirement) =>
    Object.hasOwn(requirement, 'bearer'),
  );
  const request: Record<string, unknown> = {
    method: method.toUpperCase(),
    header: requestBody
      ? [{ key: 'Content-Type', value: 'application/json', type: 'text' }]
      : [],
    auth: secured ? undefined : { type: 'noauth' },
    description: operation.description ?? operation.summary,
    url: {
      raw: `{{baseUrl}}${postmanPath}`,
      host: ['{{baseUrl}}'],
      path: postmanPath.split('/').filter(Boolean),
      query,
      variable: pathVariables,
    },
  };

  if (requestBody) {
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(exampleForSchema(document, requestBody), null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  return {
    name: operation.summary ?? operation.operationId ?? `${method} ${path}`,
    request,
    response: [],
  };
}

function resolveParameter(
  document: OpenAPIObject,
  parameter: ParameterObject | ReferenceObject,
): ParameterObject | undefined {
  if (!('$ref' in parameter)) return parameter;
  const name = parameter.$ref.split('/').at(-1);
  const resolved = name ? document.components?.parameters?.[name] : undefined;
  return resolved && !('$ref' in resolved) ? resolved : undefined;
}

function resolveRequestBodySchema(
  document: OpenAPIObject,
  operation: OperationObject,
): SchemaObject | ReferenceObject | undefined {
  const requestBody = operation.requestBody;
  if (!requestBody) return undefined;
  const resolved =
    '$ref' in requestBody
      ? document.components?.requestBodies?.[
          requestBody.$ref.split('/').at(-1)!
        ]
      : requestBody;
  if (!resolved || '$ref' in resolved) return undefined;
  return resolved.content?.['application/json']?.schema;
}

function exampleForSchema(
  document: OpenAPIObject,
  schema: SchemaObject | ReferenceObject,
  visited = new Set<string>(),
): unknown {
  if ('$ref' in schema) {
    if (visited.has(schema.$ref)) return {};
    visited.add(schema.$ref);
    const name = schema.$ref.split('/').at(-1);
    const referenced = name ? document.components?.schemas?.[name] : undefined;
    return referenced ? exampleForSchema(document, referenced, visited) : {};
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'array' && schema.items) {
    return [exampleForSchema(document, schema.items, new Set(visited))];
  }
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, property]) => [
        name,
        exampleForSchema(document, property, new Set(visited)),
      ]),
    );
  }
  switch (schema.type) {
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'string':
      return schema.format === 'date-time'
        ? '2026-01-01T00:00:00.000Z'
        : schema.format === 'uuid'
          ? '00000000-0000-4000-8000-000000000000'
          : '';
    default:
      return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

void exportApiContracts().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
