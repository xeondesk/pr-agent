import { NextRequest, NextResponse } from 'next/server';
import { log } from './logger';
import { v4 as uuidv4 } from 'uuid';

export interface RequestMetadata {
  requestId: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  userId?: string;
  startTime: number;
  duration?: number;
  statusCode?: number;
  error?: string;
}

// Store request metadata for logging
const requestContext = new Map<string, RequestMetadata>();

/**
 * Middleware to log all HTTP requests and responses
 */
export function createRequestLogger(request: NextRequest): { requestId: string } {
  const requestId = uuidv4();
  const startTime = Date.now();

  const metadata: RequestMetadata = {
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    ip: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
    startTime,
  };

  requestContext.set(requestId, metadata);

  // Log incoming request
  log.info('Incoming request', {
    requestId,
    method: metadata.method,
    path: metadata.path,
    ip: metadata.ip,
  });

  return { requestId };
}

/**
 * Log response and clean up request context
 */
export function logResponse(
  requestId: string,
  statusCode: number,
  error?: Error
): void {
  const metadata = requestContext.get(requestId);

  if (!metadata) {
    console.warn(`[v0] Request context not found for ${requestId}`);
    return;
  }

  const duration = Date.now() - metadata.startTime;
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  log[level](`Request completed`, {
    requestId,
    method: metadata.method,
    path: metadata.path,
    statusCode,
    duration: `${duration}ms`,
    ip: metadata.ip,
    ...(error && { error: error.message, stack: error.stack }),
  });

  requestContext.delete(requestId);
}

/**
 * Get request metadata for current request
 */
export function getRequestMetadata(requestId: string): RequestMetadata | undefined {
  return requestContext.get(requestId);
}

/**
 * Add context to request metadata
 */
export function addRequestContext(requestId: string, context: Record<string, unknown>): void {
  const metadata = requestContext.get(requestId);
  if (metadata) {
    Object.assign(metadata, context);
  }
}
