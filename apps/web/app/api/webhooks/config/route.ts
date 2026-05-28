import { NextResponse, type NextRequest } from 'next/server';
import { webhookConfigRequestSchema, type WebhookConfigRequest } from '@/lib/api/schemas';
import { generateWebhookSecret } from '@/lib/webhooks';
import { getSupabaseClient } from '@/lib/db';
import { ApiError, NotFoundError, handleApiError } from '@/lib/api/errors';
import { verifySession } from '@/lib/auth/server';
import { withAuth } from '@/lib/api/middleware';
import type { ApiRequest } from '@/lib/api/types';

async function createHandler(req: ApiRequest<WebhookConfigRequest>) {
  const { repoFullName, autoReview, autoDescribe, autoImprove, postComments } = req.body;

  const supabase = getSupabaseClient();
  if (!supabase) throw new ApiError('DB_UNAVAILABLE', 'Database not configured', 503);

  const { data: existing } = await supabase
    .from('webhook_configs')
    .select('id')
    .eq('repo_full_name', repoFullName)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('webhook_configs')
      .update({
        auto_review: autoReview,
        auto_describe: autoDescribe,
        auto_improve: autoImprove,
        post_comments: postComments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new ApiError('DB_ERROR', 'Failed to update webhook config', 500);
    return NextResponse.json(data);
  }

  const secret = generateWebhookSecret();
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/github`;

  const { data, error } = await supabase
    .from('webhook_configs')
    .insert({
      user_id: req.userId,
      repo_full_name: repoFullName,
      webhook_secret: secret,
      webhook_url: webhookUrl,
      enabled: true,
      auto_review: autoReview,
      auto_describe: autoDescribe,
      auto_improve: autoImprove,
      post_comments: postComments,
    })
    .select()
    .single();

  if (error) throw new ApiError('DB_ERROR', 'Failed to create webhook config', 500);

  return NextResponse.json(data, { status: 201 });
}

async function handleGet(request: NextRequest) {
  try {
    const user = await verifySession(request.headers.get('authorization')?.slice(7) || '');
    if (!user) {
      return NextResponse.json({ status: 'error', error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const repoFullName = searchParams.get('repo');

    if (!repoFullName) {
      return NextResponse.json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Missing repo parameter' } }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) throw new ApiError('DB_UNAVAILABLE', 'Database not configured', 503);

    const { data, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('repo_full_name', repoFullName)
      .eq('user_id', user.id)
      .single();

    if (error || !data) throw new NotFoundError('Webhook config', repoFullName);

    const { webhook_secret: _secret, ...safe } = data;
    return NextResponse.json(safe);
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleDelete(request: NextRequest) {
  try {
    const user = await verifySession(request.headers.get('authorization')?.slice(7) || '');
    if (!user) {
      return NextResponse.json({ status: 'error', error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const repoFullName = searchParams.get('repo');

    if (!repoFullName) {
      return NextResponse.json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'Missing repo parameter' } }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) throw new ApiError('DB_UNAVAILABLE', 'Database not configured', 503);

    const { error } = await supabase
      .from('webhook_configs')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('repo_full_name', repoFullName)
      .eq('user_id', user.id);

    if (error) throw new ApiError('DB_ERROR', 'Failed to disable webhook', 500);

    return NextResponse.json({ message: 'Webhook disabled' });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withAuth(webhookConfigRequestSchema, createHandler);
export const GET = handleGet;
export const DELETE = handleDelete;
