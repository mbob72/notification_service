import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: issue?.message ?? 'Invalid request payload',
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: 'internal_server_error',
      message: 'Internal server error',
    },
  });
}
