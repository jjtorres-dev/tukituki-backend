import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const logger = new Logger('HTTP');
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestIdHeader = request.header('x-request-id');
  const requestId =
    requestIdHeader &&
    requestIdHeader.length <= 128 &&
    REQUEST_ID_PATTERN.test(requestIdHeader)
      ? requestIdHeader
      : randomUUID();
  const startedAt = Date.now();

  (request as RequestWithId).requestId = requestId;
  response.setHeader('x-request-id', requestId);
  response.on('finish', () => {
    logger.log(
      JSON.stringify({
        event: 'http_request',
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  });

  next();
}
