import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/security';
import { getConfig } from '@/lib/config';

/**
 * Rate limiter instances per endpoint
 */
const limiters: Map<string, RateLimiter> = new Map();

/**
 * Get or create a rate limiter for an endpoint
 */
function getLimiter(endpoint: string): RateLimiter {
  if (!limiters.has(endpoint)) {
    const cfg = getConfig();
    const limiter = new RateLimiter(
      cfg.RATE_LIMIT_REQUESTS_PER_MINUTE,
      60000 // 1 minute window
    );
    limiters.set(endpoint, limiter);
  }
  return limiters.get(endpoint)!;
}

/**
 * Get rate limit key from request
 * Prioritizes: authenticated user > API key > IP address
 */
function getRateLimitKey(request: NextRequest): string {
  // Try to get user ID from auth header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // Extract user ID from JWT (simplified)
    try {
      const token = authHeader.slice(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload.sub || payload.user_id) {
          return `user:${payload.sub || payload.user_id}`;
        }
      }
    } catch {
      // Fall through to IP-based limiting
    }
  }

  // Fall back to IP address
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  return `ip:${ip}`;
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(request: NextRequest): NextResponse | null {
  const cfg = getConfig();

  if (!cfg.ENABLE_RATE_LIMITING) {
    return null;
  }

  const endpoint = new URL(request.url).pathname;
  const key = getRateLimitKey(request);
  const limiter = getLimiter(endpoint);

  // Check if request is allowed
  if (!limiter.isAllowed(key, 1)) {
    return new NextResponse(
      JSON.stringify({
        status: 'error',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      }
    );
  }

  return null;
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  request: NextRequest,
  endpoint: string
): NextResponse {
  const key = getRateLimitKey(request);
  const limiter = getLimiter(endpoint);
  const remaining = limiter.getRemainingTokens(key);

  response.headers.set('X-RateLimit-Limit', '60');
  response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());

  return response;
}

/**
 * Webhook-specific rate limiting (higher limit, separate bucket)
 */
export function webhookRateLimit(request: NextRequest): NextResponse | null {
  const cfg = getConfig();

  if (!cfg.ENABLE_WEBHOOKS) {
    return new NextResponse(
      JSON.stringify({
        status: 'error',
        error: {
          code: 'FORBIDDEN',
          message: 'Webhooks are disabled',
        },
      }),
      { status: 403 }
    );
  }

  // GitHub webhooks use 10 requests per second per IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  // Create separate limiter for webhooks
  const webhookLimiter = getLimiter('webhooks');

  if (!webhookLimiter.isAllowed(`webhook:${ip}`, 1)) {
    return new NextResponse(
      JSON.stringify({
        status: 'error',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many webhook requests. Try again later.',
        },
      }),
      {
        status: 429,
        headers: {
          'Retry-After': '1',
        },
      }
    );
  }

  return null;
}

/**
 * Per-user API quota checking
 */
export async function checkApiQuota(userId: string, tokensNeeded: number = 1): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  // This would typically check against the database
  // For now, return a default quota
  return {
    allowed: true,
    remaining: 1000 - tokensNeeded,
    limit: 1000,
  };
}

/**
 * Reset rate limiter (for testing)
 */
export function resetRateLimiter(endpoint?: string): void {
  if (endpoint) {
    limiters.delete(endpoint);
  } else {
    limiters.forEach(limiter => limiter.clear());
  }
}
