import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDbResponse = { data: [{ id: '1' }], error: null };

vi.mock('@/lib/db', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(mockDbResponse)),
      })),
    })),
  })),
}));

function createMockRequest(): Request {
  return new Request('http://localhost/api/health');
}

describe('Health endpoint', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  });

  it('returns healthy status when DB is responsive', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(createMockRequest());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('1.0.0');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.api.status).toBe('ok');
  });

  it('returns degraded status when components fail', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(body.checks.openai.configured).toBe(false);
  });

  it('returns correct timestamp format', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
