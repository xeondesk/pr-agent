import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webhooks', () => ({
  generateWebhookSecret: vi.fn(() => 'abc123def456'),
}));

describe('Webhooks Config API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  });

  describe('POST', () => {
    it('creates a new webhook config', async () => {
      const { POST } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          repo_full_name: 'owner/repo',
          webhook_secret: 'abcdefghijklmnopqrst',
          auto_review: true,
          auto_describe: true,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const { POST } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_full_name: 'owner/repo',
          webhook_secret: 'abcdefghijklmnopqrst',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe('GET', () => {
    it('returns webhook config for a repo', async () => {
      const { GET } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config?repo=owner/repo', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.repo_full_name).toBe('owner/repo');
    });

    it('returns 400 when missing repo parameter', async () => {
      const { GET } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('disables webhook config', async () => {
      const { DELETE } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config?repo=owner/repo', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      const response = await DELETE(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe('Webhook disabled');
    });

    it('returns 200 when authenticated', async () => {
      const { DELETE } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config?repo=owner/repo', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      const response = await DELETE(request);
      expect(response.status).toBe(200);
    });
  });
});
