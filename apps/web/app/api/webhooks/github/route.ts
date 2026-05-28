import { NextResponse, type NextRequest } from 'next/server';
import { verifyGitHubSignature } from '@/lib/webhooks';
import { WebhookHandler } from '@/lib/webhookHandler';
import type { GitHubWebhookPayload } from '@/lib/webhooks';
import { getSupabaseClient } from '@/lib/db';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return NextResponse.json(
        { status: 'error', error: { code: 'SIGNATURE_MISSING', message: 'No signature provided' } },
        { status: 401 }
      );
    }

    const payload = await request.text();

    const supabase = getSupabaseClient();
    const eventId = crypto.randomUUID();

    let config;
    if (supabase) {
      const data: GitHubWebhookPayload = JSON.parse(payload);
      const repoFullName = data.repository?.full_name;
      if (!repoFullName) {
        return NextResponse.json(
          { status: 'error', error: { code: 'INVALID_REPO', message: 'Invalid repository' } },
          { status: 400 }
        );
      }

      const { data: dbConfig } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('repo_full_name', repoFullName)
        .eq('enabled', true)
        .single();

      if (!dbConfig) {
        return NextResponse.json({ message: 'Webhook not configured for this repo' }, { status: 200 });
      }

      if (!verifyGitHubSignature(payload, signature, dbConfig.webhook_secret)) {
        return NextResponse.json(
          { status: 'error', error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } },
          { status: 401 }
        );
      }

      config = dbConfig;
    } else {
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return NextResponse.json(
          { status: 'error', error: { code: 'NOT_CONFIGURED', message: 'Webhook secret not configured' } },
          { status: 500 }
        );
      }

      if (!verifyGitHubSignature(payload, signature, webhookSecret)) {
        return NextResponse.json(
          { status: 'error', error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } },
          { status: 401 }
        );
      }

      config = { auto_review: true, auto_describe: true, auto_improve: false, post_comments: true };
    }

    const data: GitHubWebhookPayload = JSON.parse(payload);
    const _repoFullName = data.repository?.full_name;

    const handler = new WebhookHandler({
      autoReview: config.auto_review ?? true,
      autoDescribe: config.auto_describe ?? true,
      autoImprove: config.auto_improve ?? false,
      postComments: config.post_comments ?? true,
    });

    let event;

    if (data.action === 'opened') {
      event = await handler.handlePROpened(data);
    } else if (data.action === 'synchronize') {
      event = await handler.handlePRSynchronized(data);
    } else {
      return NextResponse.json({ message: `Unhandled action: ${data.action}` }, { status: 200 });
    }

    event.id = eventId;

    if (supabase) {
      await supabase.from('webhook_events').insert({
        id: eventId,
        webhook_config_id: config.id,
        pr_number: event.prNumber,
        action: event.action,
        status: event.status,
        tools: event.tools,
      });
    }

    const prUrl = data.pull_request?.html_url;
    if (prUrl && event.tools.length > 0) {
      processWebhookEvent(event, prUrl, handler, config).catch((error) => {
        console.error('Failed to process webhook event:', error);
        if (supabase) {
          supabase.from('webhook_events').update({ status: 'failed', error: String(error), completed_at: new Date().toISOString() }).eq('id', eventId);
        }
      });
    }

    return NextResponse.json({ message: 'Webhook received', eventId }, { status: 202 });
  } catch (error) {
    console.error('Webhook error:', error);
    return handleApiError(error);
  }
}

async function processWebhookEvent(event: any, prUrl: string, handler: WebhookHandler, config: any) {
  event.status = 'processing';

  const supabase = getSupabaseClient();

  try {
    const results = await handler.executeTools(prUrl, event.tools, (tool, _result) => {
      console.log(`[Webhook] Tool ${tool} completed`);
    });

    event.results = results;
    event.status = 'completed';

    if (config.post_comments && prUrl) {
      const comment = handler.formatResultsAsComment(results);
      const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (match) {
        const [, owner, repo, prNumber] = match;
        const ghToken = process.env.GITHUB_TOKEN;
        if (ghToken) {
          await handler.postCommentToPR(ghToken, owner, repo, parseInt(prNumber), comment);
        }
      }
    }

    event.completedAt = new Date();

    if (supabase) {
      await supabase.from('webhook_events').update({
        status: 'completed',
        results,
        completed_at: event.completedAt.toISOString(),
      }).eq('id', event.id);
    }
  } catch (error) {
    event.status = 'failed';
    event.error = error instanceof Error ? error.message : 'Unknown error';
    event.completedAt = new Date();

    if (supabase) {
      await supabase.from('webhook_events').update({
        status: 'failed',
        error: event.error,
        completed_at: event.completedAt.toISOString(),
      }).eq('id', event.id);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Missing eventId' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { status: 'error', error: { code: 'DB_UNAVAILABLE', message: 'Database not configured' } },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { status: 'error', error: { code: 'NOT_FOUND', message: 'Event not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
