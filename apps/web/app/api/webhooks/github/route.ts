import { NextRequest } from 'next/server';
import { verifyGitHubSignature } from '../../../../lib/webhooks';
import { WebhookHandler } from '../../../../lib/webhookHandler';
import type { GitHubWebhookPayload } from '../../../../lib/webhooks';
import { formatErrorResponse, ERROR_CODES, logger } from '@/lib/errors';
import { webhookRateLimit } from '@/lib/middleware/rateLimit';

export const webhookConfigs = new Map<string, any>();
const webhookEvents = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = webhookRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return formatErrorResponse(ERROR_CODES.UNAUTHORIZED, 'No signature provided', 401);
    }

    const payload = await request.text();

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return formatErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Webhook secret not configured', 500);
    }

    if (!verifyGitHubSignature(payload, signature, webhookSecret)) {
      return formatErrorResponse(ERROR_CODES.INVALID_WEBHOOK_SECRET, 'Invalid signature', 401);
    }

    const data: GitHubWebhookPayload = JSON.parse(payload);

    const repoFullName = data.repository?.full_name;
    if (!repoFullName) {
      return formatErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid repository', 400);
    }

    const config = webhookConfigs.get(repoFullName);
    if (!config || !config.enabled) {
      return new Response(
        JSON.stringify({ message: 'Webhook not configured for this repo' }),
        { status: 200 }
      );
    }

    const handler = new WebhookHandler({
      autoReview: config.autoReview,
      autoDescribe: config.autoDescribe,
      autoImprove: config.autoImprove,
      postComments: config.postComments,
    });

    let event;

    if (data.action === 'opened') {
      event = await handler.handlePROpened(data);
    } else if (data.action === 'synchronize') {
      event = await handler.handlePRSynchronized(data);
    } else {
      return new Response(
        JSON.stringify({ message: `Unhandled action: ${data.action}` }),
        { status: 200 }
      );
    }

    event.webhookConfigId = config.id;
    webhookEvents.set(event.id, event);

    const prUrl = data.pull_request?.html_url;
    if (prUrl && event.tools.length > 0) {
      processWebhookEvent(event, prUrl, handler, config).catch((error) => {
        logger.error('Failed to process webhook event:', error);
      });
    }

    return new Response(JSON.stringify({ message: 'Webhook received', eventId: event.id }), {
      status: 202,
    });
  } catch (error) {
    logger.error('Webhook error:', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}

async function processWebhookEvent(
  event: any,
  prUrl: string,
  handler: WebhookHandler,
  config: any
) {
  event.status = 'processing';

  try {
    const results = await handler.executeTools(prUrl, event.tools, (_tool: string, _result: any) => {
      logger.info(`[Webhook] Tool ${_tool} completed`);
    });

    event.results = results;
    event.status = 'completed';

    if (config.postComments && prUrl) {
      const comment = handler.formatResultsAsComment(results);
      const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (match) {
        const [, owner, repo, prNumber] = match;
        const ghToken = process.env.GITHUB_TOKEN;
        if (ghToken) {
          await handler.postCommentToPR(
            ghToken,
            owner,
            repo,
            parseInt(prNumber),
            comment
          );
        }
      }
    }

    event.completedAt = new Date();
  } catch (error) {
    event.status = 'failed';
    event.error = error instanceof Error ? error.message : 'Unknown error';
    event.completedAt = new Date();
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return formatErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing eventId', 400);
  }

  const event = webhookEvents.get(eventId);
  if (!event) {
    return formatErrorResponse(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
  }

  return new Response(JSON.stringify(event), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
