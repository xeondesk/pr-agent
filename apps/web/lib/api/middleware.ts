import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiRequest } from './types';
import { handleApiError, sendError } from './errors';

type RouteHandler<T> = (req: ApiRequest<T>) => Promise<NextResponse> | NextResponse;

interface MiddlewareOptions {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

async function extractUserId(request: Request): Promise<{ userId: string; userRole: 'user' | 'admin' } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.slice(7);
    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      const envUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
      if (envUserId) {
        return { userId: envUserId, userRole: 'admin' };
      }
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }

    const role = (user.user_metadata?.role as 'user' | 'admin') || 'user';
    return { userId: user.id, userRole: role };
  } catch {
    return null;
  }
}

export function withMiddleware<T>(
  schema: z.ZodType<T>,
  handler: RouteHandler<T>,
  options: MiddlewareOptions = {}
) {
  return async (request: Request): Promise<NextResponse> => {
    const requestId = crypto.randomUUID();

    try {
      let userId = 'anonymous';
      let userRole: 'user' | 'admin' = 'user';
      let token = '';

      if (options.requireAuth) {
        const auth = await extractUserId(request);
        if (!auth) {
          return sendError('UNAUTHORIZED', 'Authentication required', 401);
        }
        userId = auth.userId;
        userRole = auth.userRole;
        token = request.headers.get('authorization')?.slice(7) || '';
      }

      if (options.requireAdmin && userRole !== 'admin') {
        return sendError('FORBIDDEN', 'Admin access required', 403);
      }

      if (options.rateLimit && userId !== 'anonymous') {
        const allowed = checkRateLimit(
          userId,
          options.rateLimit.maxRequests,
          options.rateLimit.windowMs
        );
        if (!allowed) {
          return sendError('RATE_LIMITED', 'Too many requests', 429);
        }
      }

      let body: T;
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);

      if (hasBody) {
        try {
          const raw = await request.clone().json();
          body = schema.parse(raw);
        } catch (error) {
          if (error instanceof z.ZodError) {
            return sendError('VALIDATION_ERROR', 'Request validation failed', 400, error.issues);
          }
          return sendError('INVALID_JSON', 'Invalid JSON in request body', 400);
        }
      } else {
        try {
          body = schema.parse({});
        } catch (error) {
          if (error instanceof z.ZodError) {
            return sendError('VALIDATION_ERROR', 'Request validation failed', 400, error.issues);
          }
          return sendError('INVALID_REQUEST', 'Invalid request', 400);
        }
      }

      const apiReq: ApiRequest<T> = { body, userId, userRole, requestId, token };

      const response = await handler(apiReq);

      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        return response;
      }

      const responseBody = await response.clone().json().catch(() => ({}));
      const enhanced = NextResponse.json(
        { ...responseBody, requestId },
        { status: response.status, headers: response.headers }
      );

      return enhanced;
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export function withAuth<T>(
  schema: z.ZodType<T>,
  handler: RouteHandler<T>,
  options: Omit<MiddlewareOptions, 'requireAuth'> = {}
) {
  return withMiddleware(schema, handler, { ...options, requireAuth: true });
}

export function withAdmin<T>(
  schema: z.ZodType<T>,
  handler: RouteHandler<T>,
  options: Omit<MiddlewareOptions, 'requireAuth' | 'requireAdmin'> = {}
) {
  return withMiddleware(schema, handler, { ...options, requireAuth: true, requireAdmin: true });
}
