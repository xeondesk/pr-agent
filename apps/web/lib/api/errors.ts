import { NextResponse } from 'next/server';
import type { ApiErrorResponse } from './types';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      `${resource}${id ? ` '${id}'` : ''} not found`,
      404
    );
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
  }
}

export class ValidationError extends ApiError {
  constructor(details: unknown) {
    super('VALIDATION_ERROR', 'Request validation failed', 400, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter: number) {
    super('RATE_LIMITED', 'Too many requests, please try again later', 429, { retryAfter });
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export function sendError(
  code: string,
  message: string,
  statusCode: number = 400,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      status: 'error',
      error: { code, message, ...(details !== undefined && { details }) },
    },
    { status: statusCode }
  );
}

export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiError) {
    return sendError(error.code, error.message, error.statusCode, error.details);
  }

  if (error instanceof SyntaxError) {
    return sendError('INVALID_JSON', 'Invalid JSON in request body', 400);
  }

  console.error('[API] Unhandled error:', error);
  return sendError(
    'INTERNAL_ERROR',
    'An unexpected error occurred',
    500
  );
}
