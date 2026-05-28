import { NextRequest, NextResponse } from 'next/server';
import {
  verifyGitHubWebhookSignature,
  verifyWebhookTimestamp,
  isWebhookEventProcessed,
  validateWebhookEvent,
  logWebhookDelivery,
} from '@/lib/webhooks/security';
import { enqueueWebhookEvent } from '@/lib/webhooks/queue';
import { createClient } from '@supabase/supabase-js';
import { formatErrorResponse, ERROR_CODES, logger } from '@/lib/errors';

/**
 * POST /api/webhooks/github-secure
 * Secure GitHub webhook endpoint with full validation
 * - Signature verification (prevents spoofing)
 * - Timestamp validation (prevents replay attacks)
 * - Idempotency checks (prevents duplicate processing)
 * - Event queuing (reliable delivery with retries)
 * - Audit logging (security trail)
 */
export async function POST(request: NextRequest) {
  const deliveryId = request.headers.get('x-github-delivery') || crypto.randomUUID();
  const timestamp = request.headers.get('x-github-delivery-timestamp') || new Date().toISOString();
  const signature = request.headers.get('x-hub-signature-256');

  try {
    // Step 1: Verify webhook secret (prevents spoofing)
    if (!signature) {
      return formatErrorResponse(
        ERROR_CODES.UNAUTHORIZED,
        'Missing webhook signature',
        401,
        undefined,
        deliveryId
      );
    }

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('Webhook secret not configured');
      return formatErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        'Server misconfiguration',
        500,
        undefined,
        deliveryId
      );
    }

    const payload = await request.text();
    const signatureVerification = verifyGitHubWebhookSignature(payload, signature, webhookSecret);

    if (!signatureVerification.valid) {
      logger.warn('Invalid webhook signature', { deliveryId, error: signatureVerification.error });
      return formatErrorResponse(
        ERROR_CODES.INVALID_WEBHOOK_SECRET,
        'Webhook verification failed',
        401,
        undefined,
        deliveryId
      );
    }

    // Step 2: Verify timestamp (prevents replay attacks)
    const timestampVerification = verifyWebhookTimestamp(timestamp);
    if (!timestampVerification.valid) {
      logger.warn('Invalid webhook timestamp', { deliveryId, error: timestampVerification.error });
      return formatErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Webhook timestamp invalid',
        400,
        undefined,
        deliveryId
      );
    }

    // Step 3: Parse and validate event structure
    let data;
    try {
      data = JSON.parse(payload);
    } catch (error) {
      return formatErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid JSON payload',
        400,
        undefined,
        deliveryId
      );
    }

    const eventValidation = validateWebhookEvent(data);
    if (!eventValidation.valid) {
      logger.warn('Invalid webhook event structure', {
        deliveryId,
        error: eventValidation.error,
      });
      return formatErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        eventValidation.error || 'Invalid event data',
        400,
        undefined,
        deliveryId
      );
    }

    // Step 4: Find webhook configuration for this repository
    const repoFullName = data.repository.full_name;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('Supabase not configured');
      return formatErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        'Server misconfiguration',
        500,
        undefined,
        deliveryId
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: configs, error: configError } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('repository_name', repoFullName)
      .eq('enabled', true)
      .limit(1);

    if (configError) {
      logger.error('Error fetching webhook config', { error: configError, deliveryId });
      return NextResponse.json(
        { message: 'Webhook received but not configured' },
        { status: 200 }
      );
    }

    if (!configs || configs.length === 0) {
      logger.info('No webhook config for repository', { repoFullName, deliveryId });
      return NextResponse.json(
        { message: 'Webhook received but not configured for this repository' },
        { status: 200 }
      );
    }

    const config = configs[0];
    const userId = config.user_id;

    // Step 5: Check idempotency (prevents duplicate processing)
    const alreadyProcessed = await isWebhookEventProcessed(deliveryId, userId);
    if (alreadyProcessed) {
      logger.info('Webhook already processed', { deliveryId, userId });
      return NextResponse.json(
        { message: 'Webhook already processed', deliveryId },
        { status: 200 }
      );
    }

    // Step 6: Enqueue event for reliable processing
    const queuedEvent = await enqueueWebhookEvent(
      userId,
      config.id,
      data,
      deliveryId
    );

    if (!queuedEvent) {
      logger.error('Failed to enqueue webhook event', { deliveryId, userId });
      return formatErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        'Failed to process webhook',
        500,
        undefined,
        deliveryId
      );
    }

    // Step 7: Log delivery attempt
    await logWebhookDelivery(userId, config.id, queuedEvent.id, 'pending');

    logger.info('Webhook queued for processing', {
      deliveryId,
      eventId: queuedEvent.id,
      action: data.action,
      repository: repoFullName,
    });

    return NextResponse.json(
      {
        message: 'Webhook received and queued for processing',
        deliveryId,
        eventId: queuedEvent.id,
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('Webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      deliveryId,
    });

    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Webhook processing failed',
      500,
      undefined,
      deliveryId
    );
  }
}

/**
 * GET /api/webhooks/github-secure
 * Webhook configuration endpoint (not typically called by GitHub)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { message: 'Webhook endpoint - POST only' },
    { status: 405 }
  );
}
