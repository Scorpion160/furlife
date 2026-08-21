import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof raw === 'object' && raw && 'message' in raw
        ? (raw as { message: unknown }).message
        : status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : raw;
    const code =
      typeof raw === 'object' && raw && 'code' in raw && typeof (raw as { code?: unknown }).code === 'string'
        ? (raw as { code: string }).code
        : exception instanceof HttpException
          ? exception.name
          : 'InternalServerError';

    response.status(status).json({
      error: {
        status,
        code,
        message,
        requestId: response.locals.requestId ?? null,
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
