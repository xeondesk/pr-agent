import { describe, it, expect } from 'vitest';
import {
  ApiError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  RateLimitError,
  ConflictError,
  sendError,
  handleApiError,
} from '@/lib/api/errors';

describe('ApiError', () => {
  it('creates error with code, message, and status code', () => {
    const error = new ApiError('TEST_ERROR', 'Test message', 400);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('ApiError');
  });

  it('defaults to 400 status code', () => {
    const error = new ApiError('TEST', 'msg');
    expect(error.statusCode).toBe(400);
  });

  it('includes optional details', () => {
    const details = { field: 'name' };
    const error = new ApiError('TEST', 'msg', 400, details);
    expect(error.details).toEqual(details);
  });
});

describe('NotFoundError', () => {
  it('creates 404 error with resource name', () => {
    const error = new NotFoundError('Conversation', 'abc-123');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toContain('Conversation');
    expect(error.message).toContain('abc-123');
    expect(error.statusCode).toBe(404);
  });

  it('works without id', () => {
    const error = new NotFoundError('Config');
    expect(error.message).toBe('Config not found');
  });
});

describe('UnauthorizedError', () => {
  it('creates 401 error', () => {
    const error = new UnauthorizedError();
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Authentication required');
  });

  it('accepts custom message', () => {
    const error = new UnauthorizedError('Token expired');
    expect(error.message).toBe('Token expired');
  });
});

describe('ForbiddenError', () => {
  it('creates 403 error', () => {
    const error = new ForbiddenError();
    expect(error.code).toBe('FORBIDDEN');
    expect(error.statusCode).toBe(403);
  });
});

describe('ValidationError', () => {
  it('creates 400 error with details', () => {
    const issues = [{ path: ['name'], message: 'Required' }];
    const error = new ValidationError(issues);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(issues);
  });
});

describe('RateLimitError', () => {
  it('creates 429 error with retryAfter', () => {
    const error = new RateLimitError(60);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.statusCode).toBe(429);
    expect(error.details).toEqual({ retryAfter: 60 });
  });
});

describe('ConflictError', () => {
  it('creates 409 error', () => {
    const error = new ConflictError('Already exists');
    expect(error.code).toBe('CONFLICT');
    expect(error.statusCode).toBe(409);
  });
});

describe('sendError', () => {
  it('returns JSON response with error structure', () => {
    const response = sendError('NOT_FOUND', 'Resource not found', 404);
    expect(response.status).toBe(404);
  });

  it('returns 400 by default', () => {
    const response = sendError('BAD_REQUEST', 'Bad input');
    expect(response.status).toBe(400);
  });

  it('includes details when provided', async () => {
    const response = sendError('VALIDATION', 'Invalid', 400, { field: 'email' });
    const body = await response.json();
    expect(body.error.details).toEqual({ field: 'email' });
  });
});

describe('handleApiError', () => {
  it('handles ApiError instances', async () => {
    const error = new NotFoundError('Resource');
    const response = handleApiError(error);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('handles SyntaxError (invalid JSON)', async () => {
    const error = new SyntaxError('Unexpected token');
    const response = handleApiError(error);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('handles unknown errors as 500', async () => {
    const error = new Error('Something broke');
    const response = handleApiError(error);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles non-Error values', async () => {
    const response = handleApiError('string error');
    expect(response.status).toBe(500);
  });
});
