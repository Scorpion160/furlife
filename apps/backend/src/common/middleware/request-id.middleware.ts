import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
