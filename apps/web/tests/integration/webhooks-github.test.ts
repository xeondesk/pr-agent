import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webhooks', () => ({
  verifyGitHubSignature: vi.fn(),
}));

vi.mock('@/lib/webhookHandler', () => ({
  WebhookHandler: vi.fn(),
}));

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

describe('Webhooks GitHub API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', 'test-secret');
  });

  beforeAll(async () => {
    const { webhookConfigs } = await import('@/app/api/webhooks/github/route');
    webhookConfigs.set('owner/repo', {
      id: 'wh_test',
      repoFullName: 'owner/repo',
      enabled: true,
      autoReview: true,
      autoDescribe: true,
      autoImprove: false,
      postComments: true,
    });
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
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when signature is invalid', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      vi.mocked(verifyGitHubSignature).mockReturnValue(false);

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
      expect(body.error.code).toBe('INVALID_WEBHOOK_SECRET');
    });

    it('returns 202 and processes opened PR event', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      const { WebhookHandler } = await import('@/lib/webhookHandler');

      vi.mocked(verifyGitHubSignature).mockReturnValue(true);

      (vi.mocked(WebhookHandler) as any).mockImplementation(class {
        handlePROpened = vi.fn().mockResolvedValue(mockEvent);
        executeTools = vi.fn().mockResolvedValue({ code_review: { issues: [] } });
        formatResultsAsComment = vi.fn().mockReturnValue('Comment text');
        postCommentToPR = vi.fn().mockResolvedValue(undefined);
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
      vi.mocked(verifyGitHubSignature).mockReturnValue(true);

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

    it('processes webhook with env secret', async () => {
      const { verifyGitHubSignature } = await import('@/lib/webhooks');
      const { WebhookHandler } = await import('@/lib/webhookHandler');

      vi.mocked(verifyGitHubSignature).mockReturnValue(true);
      (vi.mocked(WebhookHandler) as any).mockImplementation(class {
        handlePROpened = vi.fn().mockResolvedValue(mockEvent);
        executeTools = vi.fn().mockResolvedValue({ code_review: { issues: [] } });
        formatResultsAsComment = vi.fn().mockReturnValue('Comment');
        postCommentToPR = vi.fn();
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
          pull_request: { html_url: 'https://github.com/owner/repo/pull/1' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(202);
    });

    it('returns 500 when env secret not configured', async () => {
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
    it('returns 400 when eventId missing', async () => {
      const { GET } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it('returns 404 when event not found', async () => {
      const { GET } = await import('@/app/api/webhooks/github/route');

      const request = new NextRequest('http://localhost/api/webhooks/github?eventId=nonexistent', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(404);
    });
  });
});
