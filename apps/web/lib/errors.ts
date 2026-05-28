import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';

/**
 * Custom API Error class for consistent error handling
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Error codes for different scenarios
 */
export const ERROR_CODES = {
  // Authentication & Authorization (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Validation (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  
  // Resource (4xx)
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  
  // API (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  
  // External Services (5xx)
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  OPENAI_API_ERROR: 'OPENAI_API_ERROR',
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  
  // Business Logic
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_WEBHOOK_SECRET: 'INVALID_WEBHOOK_SECRET',
  WEBHOOK_NOT_FOUND: 'WEBHOOK_NOT_FOUND',
};

/**
 * Format API error response
 */
export function formatErrorResponse(
  code: string,
  message: string,
  statusCode: number = 400,
  details?: Record<string, any>,
  requestId?: string
) {
  return NextResponse.json(
    {
      status: 'error',
      error: {
        code,
        message,
        ...(details && { details }),
      },
      ...(requestId && { requestId }),
    },
    { status: statusCode }
  );
}

/**
 * Format success response
 */
export function formatSuccessResponse(
  data?: any,
  statusCode: number = 200,
  requestId?: string
) {
  return NextResponse.json(
    {
      status: 'success',
      ...(data && { data }),
      ...(requestId && { requestId }),
    },
    { status: statusCode }
  );
}

/**
 * Handle validation errors from Zod
 */
export function handleValidationError(
  error: ZodError,
  requestId?: string
) {
  const details = error.issues.reduce((acc, issue) => {
    const path = issue.path.join('.');
    acc[path] = issue.message;
    return acc;
  }, {} as Record<string, string>);

  return formatErrorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    'Request validation failed',
    400,
    details,
    requestId
  );
}

/**
 * Safely parse and validate request body
 */
export async function parseRequestBody<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<{ success: true; data: T } | { success: false; error: NextResponse }> {
  try {
    const body = await request.json();
    const parsed = schema.parse(body);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: handleValidationError(error),
      };
    }
    
    return {
      success: false,
      error: formatErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        'Failed to parse request body',
        400
      ),
    };
  }
}

/**
 * Create a safe API handler wrapper
 */
export function createApiHandler<T>(
  handler: (
    req: NextRequest,
    userId: string,
    requestId: string
  ) => Promise<NextResponse>,
  options?: {
    requireAuth?: boolean;
    allowPublic?: boolean;
  }
) {
  return async (request: NextRequest) => {
    const requestId = crypto.randomUUID();

    try {
      // Get auth token if required
      if (options?.requireAuth !== false) {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token && !options?.allowPublic) {
          return formatErrorResponse(
            ERROR_CODES.UNAUTHORIZED,
            'Authentication token required',
            401,
            undefined,
            requestId
          );
        }

        // Extract userId from token (simplified - should verify JWT)
        const userId = token ? extractUserIdFromToken(token) : 'public';

        // Call handler with userId
        return await handler(request, userId, requestId);
      }

      return await handler(request, 'public', requestId);
    } catch (error) {
      console.error('[v0] Handler error:', { error, requestId });

      if (error instanceof ApiError) {
        return formatErrorResponse(
          error.code,
          error.message,
          error.statusCode,
          error.details,
          requestId
        );
      }

      if (error instanceof Error && error.message.includes('Unauthorized')) {
        return formatErrorResponse(
          ERROR_CODES.UNAUTHORIZED,
          error.message,
          401,
          undefined,
          requestId
        );
      }

      // Generic internal error
      return formatErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        'Internal server error. Please try again later.',
        500,
        undefined,
        requestId
      );
    }
  };
}

/**
 * Extract userId from JWT token (simplified)
 * In production, use proper JWT verification with jwtverify or similar
 */
function extractUserIdFromToken(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return '';

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub || payload.user_id || '';
  } catch {
    return '';
  }
}

/**
 * Specific error constructors for common scenarios
 */
export const createErrors = {
  unauthorized: (message = 'Unauthorized') =>
    new ApiError(ERROR_CODES.UNAUTHORIZED, message, 401),

  forbidden: (message = 'Forbidden') =>
    new ApiError(ERROR_CODES.FORBIDDEN, message, 403),

  notFound: (resource: string) =>
    new ApiError(ERROR_CODES.NOT_FOUND, `${resource} not found`, 404),

  conflict: (message: string) =>
    new ApiError(ERROR_CODES.CONFLICT, message, 409),

  alreadyExists: (resource: string) =>
    new ApiError(ERROR_CODES.ALREADY_EXISTS, `${resource} already exists`, 409),

  validationError: (details: Record<string, any>) =>
    new ApiError(
      ERROR_CODES.VALIDATION_ERROR,
      'Validation failed',
      400,
      details
    ),

  rateLimitExceeded: (retryAfter?: number) =>
    new ApiError(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Rate limit exceeded. Please try again later.',
      429
    ),

  internalError: (message = 'Internal server error') =>
    new ApiError(ERROR_CODES.INTERNAL_ERROR, message, 500),

  serviceUnavailable: (message = 'Service temporarily unavailable') =>
    new ApiError(ERROR_CODES.SERVICE_UNAVAILABLE, message, 503),

  githubApiError: (details?: Record<string, any>) =>
    new ApiError(
      ERROR_CODES.GITHUB_API_ERROR,
      'Failed to communicate with GitHub API',
      503,
      details
    ),

  openaiApiError: (details?: Record<string, any>) =>
    new ApiError(
      ERROR_CODES.OPENAI_API_ERROR,
      'Failed to process with OpenAI',
      503,
      details
    ),

  supabaseError: (details?: Record<string, any>) =>
    new ApiError(
      ERROR_CODES.SUPABASE_ERROR,
      'Database operation failed',
      500,
      details
    ),

  invalidWebhookSecret: () =>
    new ApiError(
      ERROR_CODES.INVALID_WEBHOOK_SECRET,
      'Invalid webhook signature',
      401
    ),

  webhookNotFound: () =>
    new ApiError(
      ERROR_CODES.WEBHOOK_NOT_FOUND,
      'Webhook configuration not found',
      404
    ),
};

/**
 * Middleware to add request context
 */
export function addRequestContext(response: NextResponse, requestId: string) {
  response.headers.set('X-Request-ID', requestId);
  return response;
}

/**
 * Logger utility for structured logging
 */
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[v0] ${message}`, data);
  },

  error: (message: string, error?: any) => {
    console.error(`[v0] ERROR: ${message}`, error);
  },

  warn: (message: string, data?: any) => {
    console.warn(`[v0] WARN: ${message}`, data);
  },

  debug: (message: string, data?: any) => {
    if (process.env.DEBUG === 'true') {
      console.debug(`[v0] DEBUG: ${message}`, data);
    }
  },
};
