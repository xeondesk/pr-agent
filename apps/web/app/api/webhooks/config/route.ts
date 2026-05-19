import { generateWebhookSecret } from '../../../../lib/webhooks';

// In production, store in database
const webhookConfigs = new Map<string, any>();

export async function POST(request: Request) {
  try {
    const { repoFullName, autoReview, autoDescribe, autoImprove, postComments } =
      await request.json();

    if (!repoFullName) {
      return new Response(JSON.stringify({ error: 'Missing repoFullName' }), {
        status: 400,
      });
    }

    // Check if config already exists
    let config = webhookConfigs.get(repoFullName);

    if (!config) {
      const secret = generateWebhookSecret();
      config = {
        id: `wh_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        repoFullName,
        secret,
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/github`,
        enabled: true,
        createdAt: new Date(),
      };
      webhookConfigs.set(repoFullName, config);
    }

    // Update settings
    config.autoReview = autoReview ?? config.autoReview ?? true;
    config.autoDescribe = autoDescribe ?? config.autoDescribe ?? true;
    config.autoImprove = autoImprove ?? config.autoImprove ?? false;
    config.postComments = postComments ?? config.postComments ?? true;
    config.updatedAt = new Date();

    return new Response(
      JSON.stringify({
        id: config.id,
        repoFullName: config.repoFullName,
        webhookUrl: config.webhookUrl,
        secret: config.secret,
        enabled: config.enabled,
        autoReview: config.autoReview,
        autoDescribe: config.autoDescribe,
        autoImprove: config.autoImprove,
        postComments: config.postComments,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const repoFullName = searchParams.get('repo');

    if (!repoFullName) {
      return new Response(JSON.stringify({ error: 'Missing repo parameter' }), {
        status: 400,
      });
    }

    const config = webhookConfigs.get(repoFullName);

    if (!config) {
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        status: 404,
      });
    }

    return new Response(
      JSON.stringify({
        id: config.id,
        repoFullName: config.repoFullName,
        webhookUrl: config.webhookUrl,
        enabled: config.enabled,
        autoReview: config.autoReview,
        autoDescribe: config.autoDescribe,
        autoImprove: config.autoImprove,
        postComments: config.postComments,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const repoFullName = searchParams.get('repo');

    if (!repoFullName) {
      return new Response(JSON.stringify({ error: 'Missing repo parameter' }), {
        status: 400,
      });
    }

    webhookConfigs.delete(repoFullName);

    return new Response(JSON.stringify({ message: 'Webhook disabled' }), {
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    );
  }
}
