import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/webhooks', () => ({
  generateWebhookSecret: vi.fn(() => 'abc123def456'),
}));

function buildMockSupabase() {
  const chainable = {
    eq: vi.fn(() => chainable),
    select: vi.fn(() => chainable),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    from: vi.fn(() => ({
      ...chainable,
      insert: vi.fn(() => ({
        ...chainable,
        select: vi.fn(() => chainable),
      })),
      update: vi.fn(() => chainable),
      select: vi.fn(() => chainable),
    })),
  };
}

describe('Webhooks Config API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_MOCK_USER_ID', 'mock-user-id');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  });

  describe('POST', () => {
    it('creates a new webhook config', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      const supabase = buildMockSupabase();
      vi.mocked(getSupabaseClient).mockReturnValue(supabase as any);

      supabase.from().maybeSingle.mockResolvedValue({ data: null, error: null });
      supabase.from().insert().select().single.mockResolvedValue({
        data: { id: 'config-1', repo_full_name: 'owner/repo', webhook_secret: 'abc123def456' },
        error: null,
      });

      const { POST } = await import('@/app/api/webhooks/config/route');

      const request = new Request('http://localhost/api/webhooks/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          repoFullName: 'owner/repo',
          autoReview: true,
          autoDescribe: true,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('updates existing webhook config', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      const supabase = buildMockSupabase();
      vi.mocked(getSupabaseClient).mockReturnValue(supabase as any);

      supabase.from().maybeSingle.mockResolvedValue({ data: { id: 'existing-id' }, error: null });
      supabase.from().update().single.mockResolvedValue({
        data: { id: 'existing-id', repo_full_name: 'owner/repo' },
        error: null,
      });

      const { POST } = await import('@/app/api/webhooks/config/route');

      const request = new Request('http://localhost/api/webhooks/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          repoFullName: 'owner/repo',
          autoReview: true,
          autoDescribe: false,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('returns 503 when DB unavailable', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      vi.mocked(getSupabaseClient).mockReturnValue(null);

      const { POST } = await import('@/app/api/webhooks/config/route');

      const request = new Request('http://localhost/api/webhooks/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ repoFullName: 'owner/repo' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(503);
    });

    it('returns 401 without auth', async () => {
      const { POST } = await import('@/app/api/webhooks/config/route');

      const request = new Request('http://localhost/api/webhooks/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: 'owner/repo' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe('GET', () => {
    it('returns webhook config for a repo', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      const { verifySession } = await import('@/lib/auth/server');

      const supabase = buildMockSupabase();
      vi.mocked(getSupabaseClient).mockReturnValue(supabase as any);
      (vi.mocked(verifySession) as any).mockResolvedValue({ id: 'user-1' });

      supabase.from().single.mockResolvedValue({
        data: {
          id: 'config-1',
          repo_full_name: 'owner/repo',
          webhook_secret: 'secret',
          auto_review: true,
        },
        error: null,
      });

      const { GET } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config?repo=owner/repo', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.repo_full_name).toBe('owner/repo');
      expect(body.webhook_secret).toBeUndefined();
    });

    it('returns 401 when not authenticated', async () => {
      const { verifySession } = await import('@/lib/auth/server');
      (vi.mocked(verifySession) as any).mockResolvedValue(null);

      const { GET } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config?repo=owner/repo', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer bad-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('returns 400 when missing repo parameter', async () => {
      const { verifySession } = await import('@/lib/auth/server');
      (vi.mocked(verifySession) as any).mockResolvedValue({ id: 'user-1' });

      const { GET } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('disables webhook config', async () => {
      const { getSupabaseClient } = await import('@/lib/db');
      const { verifySession } = await import('@/lib/auth/server');

      const supabase = buildMockSupabase();
      vi.mocked(getSupabaseClient).mockReturnValue(supabase as any);
      (vi.mocked(verifySession) as any).mockResolvedValue({ id: 'user-1' });

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

    it('returns 401 when not authenticated', async () => {
      const { verifySession } = await import('@/lib/auth/server');
      (vi.mocked(verifySession) as any).mockResolvedValue(null);

      const { DELETE } = await import('@/app/api/webhooks/config/route');

      const request = new NextRequest('http://localhost/api/webhooks/config?repo=owner/repo', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer bad-token' },
      });

      const response = await DELETE(request);
      expect(response.status).toBe(401);
    });
  });
});
