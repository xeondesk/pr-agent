import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webhooks', () => ({
  verifyGitHubSignature: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/webhookHandler', () => ({
  WebhookHandler: vi.fn(),
}));

function buildMockSupabase(config: any = null) {
  const singleResult = config
    ? { data: config, error: null }
    : { data: null, error: { message: 'not found' } };

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(singleResult),
          })),
        })),
      })),
      insert: vi.fn(() => ({ eq: vi.fn() })),
      update: vi.fn(() => ({ eq: vi.fn() })),
    })),
  };
}

const mockEvent = {
  id: 'event-1',
  prNumber: 1,
  action: 'opened',
  status: 'processing',
  tools: ['code_review'],
  results: null,
  completedAt: null,
  error: null,
};

const validConfig = {
  id: 'cfg-1',
  webhook_secret: 'secret',
  auto_review: true,
  auto_describe: true,
  auto_improve: false,
  post_comments: true,
};

describe('Webhooks GitHub API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('POST', () => {
    it('returns 401 when signature is missing', async () => {
      const { POST } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'opened', repository: { full_name: 'owner/repo' } }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('SIGNATURE_MISSING');
    });

    it('returns 401 when signature is invalid', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      const { getSupabaseClient } = await import('@/lib/db');

      vi.mocked(verifyGitHubSignature).mockReturnValue(false);
      vi.mocked(getSupabaseClient).mockReturnValue(buildMockSupabase(validConfig) as any);

      const { POST } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=bad',
        },
        body: JSON.stringify({ action: 'opened', repository: { full_name: 'owner/repo' } }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('returns 202 and processes opened PR event', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      const { getSupabaseClient } = await import('@/lib/db');
      const { WebhookHandler } = await import('@/lib/webhookHandler');

      vi.mocked(verifyGitHubSignature).mockReturnValue(true);
      vi.mocked(getSupabaseClient).mockReturnValue(buildMockSupabase(validConfig) as any);

      (vi.mocked(WebhookHandler) as any).mockImplementation(class {
        handlePROpened = vi.fn().mockResolvedValue(mockEvent);
        executeTools = vi.fn().mockResolvedValue({ code_review: { issues: [] } });
      });

      const { POST } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=valid',
        },
        body: JSON.stringify({
          action: 'opened',
          repository: { full_name: 'owner/repo' },
          pull_request: { html_url: 'https://github.com/owner/repo/pull/1', number: 1 },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.message).toBe('Webhook received');
    });

    it('returns 200 for unhandled actions', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      const { getSupabaseClient } = await import('@/lib/db');
      const { WebhookHandler } = await import('@/lib/webhookHandler');

      vi.mocked(verifyGitHubSignature).mockReturnValue(true);
      vi.mocked(getSupabaseClient).mockReturnValue(buildMockSupabase(validConfig) as any);
      (vi.mocked(WebhookHandler) as any).mockImplementation(class {
        handlePROpened = vi.fn();
      });

      const { POST } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=valid',
        },
        body: JSON.stringify({
          action: 'labeled',
          repository: { full_name: 'owner/repo' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('falls back to env var when DB unavailable', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      const { getSupabaseClient } = await import('@/lib/db');
      const { WebhookHandler } = await import('@/lib/webhookHandler');

      vi.mocked(getSupabaseClient).mockReturnValue(null);
      vi.mocked(verifyGitHubSignature).mockReturnValue(true);
      (vi.mocked(WebhookHandler) as any).mockImplementation(class {
        handlePROpened = vi.fn().mockResolvedValue(mockEvent);
      });
      vi.stubEnv('GITHUB_WEBHOOK_SECRET', 'env-secret');

      const { POST } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=valid',
        },
        body: JSON.stringify({
          action: 'opened',
          repository: { full_name: 'owner/repo' },
          pull_request: { html_url: 'https://github.com/owner/repo/pull/1' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(202);
    });

    it('returns 500 when DB unavailable and no env secret', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      vi.mocked(getSupabaseClient).mockReturnValue(null);
      vi.stubEnv('GITHUB_WEBHOOK_SECRET', '');

      const { POST } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=test',
        },
        body: JSON.stringify({ action: 'opened', repository: { full_name: 'owner/repo' } }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });
  });

  describe('GET', () => {
    it('returns event by ID', async () => {
      const { getSupabaseClient } = await import('@/lib/db');

      vi.mocked(getSupabaseClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'event-1', status: 'completed', pr_number: 1 },
                error: null,
              }),
            })),
          })),
        })),
      } as any);

      const { GET } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github?eventId=event-1', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe('event-1');
    });

    it('returns 400 when eventId missing', async () => {
      const { GET } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it('returns 404 when event not found', async () => {
      const { getSupabaseClient } = await import('@/lib/db');

      vi.mocked(getSupabaseClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'not found' },
              }),
            })),
          })),
        })),
      } as any);

      const { GET } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github?eventId=nonexistent', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(404);
    });

    it('returns 503 when DB unavailable', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      vi.mocked(getSupabaseClient).mockReturnValue(null);

      const { GET } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github?eventId=event-1', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(503);
    });
  });
});
