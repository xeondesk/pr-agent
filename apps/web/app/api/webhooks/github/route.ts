import { verifyGitHubSignature } from '../../../../lib/webhooks';
import { WebhookHandler } from '../../../../lib/webhookHandler';
import type { GitHubWebhookPayload } from '../../../../lib/webhooks';

// In production, store these in database
const webhookConfigs = new Map<string, any>();
const webhookEvents = new Map<string, any>();

export async function POST(request: Request) {
  try {
    // Get the signature from headers
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'No signature provided' }), {
        status: 401,
      });
    }

    // Get raw body for signature verification
    const payload = await request.text();

    // Get webhook secret from environment
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 500 }
      );
    }

    // Verify signature
    if (!verifyGitHubSignature(payload, signature, webhookSecret)) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
      });
    }

    // Parse payload
    const data: GitHubWebhookPayload = JSON.parse(payload);

    // Get webhook config for this repo
    const repoFullName = data.repository?.full_name;
    if (!repoFullName) {
      return new Response(JSON.stringify({ error: 'Invalid repository' }), {
        status: 400,
      });
    }

    const config = webhookConfigs.get(repoFullName);
    if (!config || !config.enabled) {
      return new Response(
        JSON.stringify({ message: 'Webhook not configured for this repo' }),
        { status: 200 }
      );
    }

    // Process webhook event
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

    // Store event
    event.webhookConfigId = config.id;
    webhookEvents.set(event.id, event);

    // Queue background job to process tools
    const prUrl = data.pull_request?.html_url;
    if (prUrl && event.tools.length > 0) {
      // In production, use a job queue like BullMQ
      processWebhookEvent(event, prUrl, handler, config).catch((error) => {
        console.error('Failed to process webhook event:', error);
      });
    }

    return new Response(JSON.stringify({ message: 'Webhook received', eventId: event.id }), {
      status: 202,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
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
    // Execute tools
    const results = await handler.executeTools(prUrl, event.tools, (tool, _result) => {
      console.log(`[Webhook] Tool ${tool} completed`);
    });

    event.results = results;
    event.status = 'completed';

    // Post comment if enabled
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

// Expose webhook event status endpoint
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return new Response(JSON.stringify({ error: 'Missing eventId' }), {
      status: 400,
    });
  }

  const event = webhookEvents.get(eventId);
  if (!event) {
    return new Response(JSON.stringify({ error: 'Event not found' }), {
      status: 404,
    });
  }

  return new Response(JSON.stringify(event), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
