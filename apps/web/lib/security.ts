import crypto from 'crypto';
import { createHmac } from 'crypto';

/**
 * Cryptographic utilities for secure key and secret management
 */

/**
 * Generate a cryptographically secure random secret
 */
export function generateSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a secret for secure storage
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Verify a secret against its hash
 */
export function verifySecret(secret: string, hash: string): boolean {
  const secretHash = hashSecret(secret);
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(secretHash), Buffer.from(hash));
}

/**
 * Encrypt a value (e.g., GitHub token) for storage
 */
export function encryptValue(value: string, encryptionKey?: string): string {
  const key = encryptionKey || process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex').slice(0, 32),
    iv
  );

  let encrypted = cipher.update(value, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a value
 */
export function decryptValue(encryptedValue: string, encryptionKey?: string): string {
  const key = encryptionKey || process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const [ivHex, authTagHex, encrypted] = encryptedValue.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex').slice(0, 32),
    iv
  );

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

/**
 * Verify GitHub webhook signature
 * https://docs.github.com/en/developers/webhooks-and-events/webhooks/securing-your-webhooks
 */
export function verifyGitHubWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const digest = `sha256=${hmac.digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Create a GitHub webhook signature for testing
 */
export function createGitHubWebhookSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Generate an API key with prefix and random part
 */
export function generateApiKey(prefix: string = 'pra'): { key: string; hash: string } {
  const randomPart = crypto.randomBytes(32).toString('hex');
  const key = `${prefix}_${randomPart}`;
  const hash = hashSecret(key);
  return { key, hash };
}

/**
 * Verify an API key against its hash
 */
export function verifyApiKey(key: string, hash: string): boolean {
  return verifySecret(key, hash);
}

/**
 * Rate limiting token bucket implementation
 */
export class RateLimiter {
  private tokens: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second
  private readonly window: number; // milliseconds

  constructor(capacity: number = 100, window: number = 60000) {
    this.capacity = capacity;
    this.refillRate = capacity / (window / 1000);
    this.window = window;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: string, tokensNeeded: number = 1): boolean {
    const now = Date.now();
    let bucket = this.tokens.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.tokens.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timePassed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + timePassed * this.refillRate
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= tokensNeeded) {
      bucket.tokens -= tokensNeeded;
      return true;
    }

    return false;
  }

  /**
   * Get remaining tokens for a key
   */
  getRemainingTokens(key: string): number {
    const bucket = this.tokens.get(key);
    if (!bucket) return this.capacity;

    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      this.capacity,
      bucket.tokens + timePassed * this.refillRate
    );

    return Math.floor(currentTokens);
  }

  /**
   * Reset bucket for a key
   */
  reset(key: string): void {
    this.tokens.delete(key);
  }

  /**
   * Clear all buckets (for testing)
   */
  clear(): void {
    this.tokens.clear();
  }
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Mask sensitive data in logs
 */
export function maskSensitive(value: string, show: number = 4): string {
  if (value.length <= show) return '*'.repeat(value.length);
  return value.slice(0, show) + '*'.repeat(value.length - show);
}

/**
 * Create a secure request signature for internal API calls
 */
export function createRequestSignature(
  payload: Record<string, any>,
  secret: string = process.env.API_SIGNATURE_SECRET || ''
): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

/**
 * Verify a request signature
 */
export function verifyRequestSignature(
  payload: Record<string, any>,
  signature: string,
  secret: string = process.env.API_SIGNATURE_SECRET || ''
): boolean {
  const expectedSignature = createRequestSignature(payload, secret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Constants for security configuration
 */
export const SECURITY_CONFIG = {
  // Password requirements
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  
  // Secret requirements
  MIN_SECRET_LENGTH: 20,
  
  // API Key requirements
  API_KEY_PREFIX: 'pra',
  
  // Rate limiting defaults
  DEFAULT_RATE_LIMIT: 100, // requests per minute
  DEFAULT_RATE_WINDOW: 60000, // 1 minute in milliseconds
  
  // Token expiration
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
  REFRESH_TOKEN_EXPIRY_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  // Encryption
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  HASH_ALGORITHM: 'sha256',
  
  // Webhook
  WEBHOOK_TIMEOUT_MS: 30000, // 30 seconds
  WEBHOOK_MAX_RETRIES: 3,
  WEBHOOK_RETRY_DELAY_MS: 5000,
};

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < SECURITY_CONFIG.MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} characters`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a temporary token for password reset or email verification
 */
export function generateTemporaryToken(expiryMs: number = 3600000): {
  token: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiryMs);
  return { token, expiresAt };
}
