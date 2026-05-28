import { NextRequest } from 'next/server';
import { generateWebhookSecret } from '../../../../lib/webhooks';
import { WebhookConfigPayloadSchema } from '@/lib/validation';
import { parseRequestBody, formatErrorResponse, ERROR_CODES, logger } from '@/lib/errors';

const webhookConfigs = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return formatErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const parseResult = await parseRequestBody(request, WebhookConfigPayloadSchema);
    if (!parseResult.success) return parseResult.error;

    const { repo_full_name, auto_review, auto_describe, auto_improve, post_comments } = parseResult.data;

    let config = webhookConfigs.get(repo_full_name);

    if (!config) {
      const secret = generateWebhookSecret();
      config = {
        id: `wh_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        repo_full_name,
        secret,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/github`,
        enabled: true,
        created_at: new Date(),
      };
      webhookConfigs.set(repo_full_name, config);
    }

    config.auto_review = auto_review ?? config.auto_review ?? true;
    config.auto_describe = auto_describe ?? config.auto_describe ?? true;
    config.auto_improve = auto_improve ?? config.auto_improve ?? false;
    config.post_comments = post_comments ?? config.post_comments ?? true;
    config.updated_at = new Date();

    return new Response(
      JSON.stringify({
        id: config.id,
        repo_full_name: config.repo_full_name,
        webhook_url: config.webhook_url,
        secret: config.secret,
        enabled: config.enabled,
        auto_review: config.auto_review,
        auto_describe: config.auto_describe,
        auto_improve: config.auto_improve,
        post_comments: config.post_comments,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Webhook config error:', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repo_full_name = searchParams.get('repo');

    if (!repo_full_name) {
      return formatErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing repo parameter', 400);
    }

    const config = webhookConfigs.get(repo_full_name);

    if (!config) {
      return formatErrorResponse(ERROR_CODES.NOT_FOUND, 'Webhook not configured', 404);
    }

    return new Response(
      JSON.stringify({
        id: config.id,
        repo_full_name: config.repo_full_name,
        webhook_url: config.webhook_url,
        enabled: config.enabled,
        auto_review: config.auto_review,
        auto_describe: config.auto_describe,
        auto_improve: config.auto_improve,
        post_comments: config.post_comments,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Webhook config GET error:', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return formatErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { searchParams } = new URL(request.url);
    const repo_full_name = searchParams.get('repo');

    if (!repo_full_name) {
      return formatErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing repo parameter', 400);
    }

    webhookConfigs.delete(repo_full_name);

    return new Response(JSON.stringify({ message: 'Webhook disabled' }), {
      status: 200,
    });
  } catch (error) {
    logger.error('Webhook config DELETE error:', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
