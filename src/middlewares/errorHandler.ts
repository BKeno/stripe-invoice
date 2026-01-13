import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  // Operational errors (known)
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Unknown errors - hide details in production
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: isDev ? err.message : 'Internal server error'
  });
};
