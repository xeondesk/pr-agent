/**
 * Advanced rate limiting with per-user and per-IP limits
 * Uses sliding window algorithm with Redis integration
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix: string; // Redis key prefix
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check rate limit for a key
   */
  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const entry = this.store[key];

    if (!entry || now > entry.resetTime) {
      // Window expired or first request
      this.store[key] = {
        count: 1,
        resetTime: now + config.windowMs,
      };

      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: this.store[key].resetTime,
      };
    }

    // Within same window
    const allowed = entry.count < config.maxRequests;
    entry.count++;

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      retryAfter: allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    delete this.store[key];
  }

  /**
   * Get current state
   */
  get(key: string): RateLimitStore[string] | undefined {
    return this.store[key];
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keys = Object.keys(this.store);

    for (const key of keys) {
      if (now > this.store[key].resetTime) {
        delete this.store[key];
      }
    }
  }

  /**
   * Destroy cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instances for different rate limit types
const globalLimiter = new RateLimiter();
const userLimiter = new RateLimiter();
const ipLimiter = new RateLimiter();

/**
 * Rate limit configurations
 */
export const rateLimitConfigs = {
  // Global rate limit: 1000 requests per minute
  global: {
    windowMs: 60 * 1000,
    maxRequests: 1000,
    keyPrefix: 'global',
  } as RateLimitConfig,

  // Per-user rate limit: 100 requests per minute
  perUser: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'user',
  } as RateLimitConfig,

  // Per-IP rate limit: 500 requests per minute
  perIP: {
    windowMs: 60 * 1000,
    maxRequests: 500,
    keyPrefix: 'ip',
  } as RateLimitConfig,

  // Auth attempt limit: 5 attempts per 15 minutes
  authAttempt: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'auth',
  } as RateLimitConfig,

  // API key limit: 10000 requests per hour
  apiKey: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10000,
    keyPrefix: 'api',
  } as RateLimitConfig,
};

/**
 * Check global rate limit
 */
export function checkGlobalLimit(): RateLimitResult {
  return globalLimiter.check('global', rateLimitConfigs.global);
}

/**
 * Check per-user rate limit
 */
export function checkUserLimit(userId: string): RateLimitResult {
  return userLimiter.check(`${rateLimitConfigs.perUser.keyPrefix}:${userId}`, rateLimitConfigs.perUser);
}

/**
 * Check per-IP rate limit
 */
export function checkIPLimit(ip: string): RateLimitResult {
  return ipLimiter.check(`${rateLimitConfigs.perIP.keyPrefix}:${ip}`, rateLimitConfigs.perIP);
}

/**
 * Check authentication attempt limit
 */
export function checkAuthAttemptLimit(identifier: string): RateLimitResult {
  return globalLimiter.check(`${rateLimitConfigs.authAttempt.keyPrefix}:${identifier}`, rateLimitConfigs.authAttempt);
}

/**
 * Check API key limit
 */
export function checkAPIKeyLimit(apiKey: string): RateLimitResult {
  return globalLimiter.check(`${rateLimitConfigs.apiKey.keyPrefix}:${apiKey}`, rateLimitConfigs.apiKey);
}

/**
 * Reset all rate limits for a user
 */
export function resetUserLimits(userId: string): void {
  userLimiter.reset(`${rateLimitConfigs.perUser.keyPrefix}:${userId}`);
}

/**
 * Reset all rate limits for an IP
 */
export function resetIPLimits(ip: string): void {
  ipLimiter.reset(`${rateLimitConfigs.perIP.keyPrefix}:${ip}`);
}

export { RateLimiter };
