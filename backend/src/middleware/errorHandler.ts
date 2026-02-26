import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

interface ErrorWithStatus extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Standard error response format for consistent frontend handling
 */
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  field?: string;
  details?: Array<{ field: string; message: string }>;
  statusCode: number;
}

/**
 * Create a standardized error response
 */
const createErrorResponse = (
  error: string,
  message: string,
  statusCode: number,
  options?: { code?: string; field?: string; details?: Array<{ field: string; message: string }> }
): ErrorResponse => ({
  error,
  message,
  statusCode,
  ...options,
});

/**
 * Global error handler middleware
 * Provides consistent error responses with proper error codes and messages
 */
export const errorHandler = (
  err: ErrorWithStatus,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    
    const firstField = details[0]?.field || 'unknown';
    
    res.status(400).json(createErrorResponse(
      'Validation error',
      `Invalid value for field "${firstField}": ${details[0]?.message || 'validation failed'}`,
      400,
      { 
        code: 'VALIDATION_ERROR',
        field: firstField,
        details,
      }
    ));
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = (err.meta?.target as string[])?.join(', ') || 'field';
        res.status(409).json(createErrorResponse(
          'Duplicate entry',
          `A record with this ${target} already exists. Please use a different value.`,
          409,
          { code: 'DUPLICATE_ENTRY', field: target }
        ));
        return;
      }
      case 'P2025':
        res.status(404).json(createErrorResponse(
          'Not found',
          'The requested record does not exist or has been deleted.',
          404,
          { code: 'RECORD_NOT_FOUND' }
        ));
        return;
      case 'P2003':
        // Foreign key constraint
        res.status(400).json(createErrorResponse(
          'Invalid reference',
          'The referenced record does not exist.',
          400,
          { code: 'INVALID_REFERENCE' }
        ));
        return;
      case 'P2014':
        // Relation constraint
        res.status(400).json(createErrorResponse(
          'Constraint violation',
          'This operation would violate a database constraint.',
          400,
          { code: 'CONSTRAINT_VIOLATION' }
        ));
        return;
      default:
        res.status(500).json(createErrorResponse(
          'Database error',
          'An unexpected database error occurred. Please try again.',
          500,
          { code: `DB_${err.code}` }
        ));
        return;
    }
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json(createErrorResponse(
      'Invalid data',
      'The provided data is invalid or incomplete. Please check your input.',
      400,
      { code: 'INVALID_DATA' }
    ));
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json(createErrorResponse(
      'Invalid token',
      'Your session is invalid. Please log in again.',
      401,
      { code: 'INVALID_TOKEN' }
    ));
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json(createErrorResponse(
      'Session expired',
      'Your session has expired. Please log in again.',
      401,
      { code: 'TOKEN_EXPIRED' }
    ));
    return;
  }

  // Custom operational errors
  if (err.isOperational) {
    res.status(err.statusCode || 500).json(createErrorResponse(
      err.message,
      err.message,
      err.statusCode || 500,
      { code: 'OPERATIONAL_ERROR' }
    ));
    return;
  }

  // Unknown errors - don't leak details in production
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred. Please try again or contact support.',
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    ...(isDev && { stack: err.stack, debugMessage: err.message }),
  });
};

/**
 * Custom error class for operational errors
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
