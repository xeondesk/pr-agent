import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/security';
import { getConfig } from '@/lib/config';

const limiters: Map<string, RateLimiter> = new Map();

function getLimiter(endpoint: string): RateLimiter | null {
  try {
    if (!limiters.has(endpoint)) {
      const cfg = getConfig();
      const limiter = new RateLimiter(
        cfg.RATE_LIMIT_REQUESTS_PER_MINUTE,
        60000
      );
      limiters.set(endpoint, limiter);
    }
    return limiters.get(endpoint)!;
  } catch {
    return null;
  }
}

function getRateLimitKey(request: NextRequest): string {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
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

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  return `ip:${ip}`;
}

export function rateLimitMiddleware(request: NextRequest): NextResponse | null {
  try {
    const cfg = getConfig();

    if (!cfg.ENABLE_RATE_LIMITING) {
      return null;
    }

    const endpoint = new URL(request.url).pathname;
    const key = getRateLimitKey(request);
    const limiter = getLimiter(endpoint);
    if (!limiter) return null;

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
  } catch {
    return null;
  }
}

export function addRateLimitHeaders(
  response: NextResponse | Response,
  _request: NextRequest | Request,
  endpoint: string
): NextResponse | Response {
  try {
    const key = getRateLimitKey(_request as NextRequest);
    const limiter = getLimiter(endpoint);
    if (limiter) {
      const remaining = limiter.getRemainingTokens(key);
      response.headers.set('X-RateLimit-Limit', '60');
      response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
      response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());
    }
  } catch {
    // Skip rate limit headers if config unavailable
  }
  return response;
}

export function webhookRateLimit(request: NextRequest): NextResponse | null {
  try {
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

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const webhookLimiter = getLimiter('webhooks');
    if (!webhookLimiter) return null;

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
  } catch {
    return null;
  }
}

export async function checkApiQuota(userId: string, tokensNeeded: number = 1): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  return {
    allowed: true,
    remaining: 1000 - tokensNeeded,
    limit: 1000,
  };
}

export function resetRateLimiter(endpoint?: string): void {
  if (endpoint) {
    limiters.delete(endpoint);
  } else {
    limiters.forEach(limiter => limiter.clear());
  }
}
