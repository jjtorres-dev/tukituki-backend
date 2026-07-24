import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithId } from '../middleware/request-context.middleware';

interface ErrorPayload {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  timestamp: string;
  path: string;
}

function sanitizeMessageUrl(
  message: string | string[],
  originalUrl: string,
  path: string,
): string | string[] {
  if (!originalUrl.includes('?')) {
    return message;
  }

  const sanitize = (value: string): string =>
    value.split(originalUrl).join(path);

  return Array.isArray(message) ? message.map(sanitize) : sanitize(message);
}
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const details =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};
    const rawMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : details.message;
    const normalizedMessage =
      typeof rawMessage === 'string' ||
      (Array.isArray(rawMessage) &&
        rawMessage.every((item) => typeof item === 'string'))
        ? rawMessage
        : statusCode === 500
          ? 'Error interno del servidor'
          : 'La solicitud no pudo procesarse';
    const message = sanitizeMessageUrl(
      normalizedMessage,
      request.originalUrl,
      request.path,
    );
    const payload: ErrorPayload = {
      statusCode,
      error:
        typeof details.error === 'string'
          ? details.error
          : (HttpStatus[statusCode] ?? 'Error'),
      message,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
    };

    if (statusCode >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'unhandled_exception',
          ...payload,
          exception:
            exception instanceof Error ? exception.stack : String(exception),
        }),
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        JSON.stringify({
          event: 'http_exception',
          ...payload,
        }),
      );
    }

    response.status(statusCode).json(payload);
  }
}
