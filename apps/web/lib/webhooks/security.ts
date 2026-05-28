import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Webhook Security Module
 * Handles verification, encryption, and replay attack prevention
 */

const WEBHOOK_SIGNATURE_ALGORITHM = 'sha256';
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  timestamp?: number;
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookConfigId: string;
  eventId: string;
  attempt: number;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  errorMessage?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Verify GitHub webhook signature
 * Prevents webhook spoofing attacks
 */
export function verifyGitHubWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): WebhookVerificationResult {
  try {
    if (!signature || !signature.startsWith('sha256=')) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const expectedSignature = crypto
      .createHmac(WEBHOOK_SIGNATURE_ALGORITHM, secret)
      .update(payload)
      .digest('hex');

    const providedSignature = signature.slice(7); // Remove 'sha256=' prefix

    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );

    if (!isValid) {
      return { valid: false, error: 'Signature mismatch' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Verification failed' };
  }
}

/**
 * Verify webhook timestamp to prevent replay attacks
 * GitHub includes X-GitHub-Delivery header with timestamp
 */
export function verifyWebhookTimestamp(timestamp: string): WebhookVerificationResult {
  try {
    const webhookTime = new Date(timestamp).getTime();
    const currentTime = Date.now();
    const timeDiff = Math.abs(currentTime - webhookTime);

    if (timeDiff > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
      return {
        valid: false,
        error: `Webhook timestamp too old (${timeDiff}ms > ${WEBHOOK_TIMESTAMP_TOLERANCE_MS}ms)`,
      };
    }

    return { valid: true, timestamp: webhookTime };
  } catch (error) {
    return { valid: false, error: 'Invalid timestamp format' };
  }
}

/**
 * Check if webhook event has been processed before (idempotency)
 * Prevents duplicate processing of the same webhook
 */
export async function isWebhookEventProcessed(
  deliveryId: string,
  userId: string
): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[v0] Supabase not configured');
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('delivery_id', deliveryId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return !!data;
  } catch (error) {
    console.error('[v0] Error checking webhook idempotency:', error);
    return false;
  }
}

/**
 * Log webhook delivery attempt
 */
export async function logWebhookDelivery(
  userId: string,
  webhookConfigId: string,
  eventId: string,
  status: 'pending' | 'success' | 'failed' | 'retrying',
  errorMessage?: string
): Promise<WebhookDeliveryAttempt | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('webhook_deliveries')
      .insert({
        user_id: userId,
        webhook_config_id: webhookConfigId,
        event_id: eventId,
        status,
        error_message: errorMessage,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as WebhookDeliveryAttempt;
  } catch (error) {
    console.error('[v0] Error logging webhook delivery:', error);
    return null;
  }
}

/**
 * Get next retry time with exponential backoff
 */
export function getNextRetryTime(attemptNumber: number): Date {
  // 30s, 5m, 30m, 2h, 24h delays
  const delays = [30, 300, 1800, 7200, 86400];
  const delaySeconds = delays[Math.min(attemptNumber, delays.length - 1)];
  const nextRetry = new Date(Date.now() + delaySeconds * 1000);
  return nextRetry;
}

/**
 * Validate webhook event structure
 */
export function validateWebhookEvent(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid event data' };
  }

  if (!data.action) {
    return { valid: false, error: 'Missing action field' };
  }

  if (!data.repository) {
    return { valid: false, error: 'Missing repository field' };
  }

  if (!data.repository.full_name) {
    return { valid: false, error: 'Missing repository full_name' };
  }

  if (!data.pull_request && data.action !== 'push') {
    return { valid: false, error: 'Missing pull_request for PR event' };
  }

  return { valid: true };
}

/**
 * Encrypt sensitive webhook data
 */
export function encryptWebhookData(data: any, encryptionKey: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv);

    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt sensitive webhook data
 */
export function decryptWebhookData(encryptedData: string, encryptionKey: string): any {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate secure webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
