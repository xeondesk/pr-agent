import { describe, it, expect, vi, beforeEach } from 'vitest';


vi.mock('@/lib/tools', () => ({
  executeTool: vi.fn(),
}));

vi.mock('@/app/api/utils', () => ({
  createSSEHeaders: vi.fn(() => new Headers({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })),
  fetchGitHubPR: vi.fn(),
  createMockPRData: vi.fn(() => ({
    url: 'mock',
    title: 'Mock PR',
    description: 'Mock description',
    diff: '',
    files: [],
    author: 'mock',
    baseBranch: 'main',
    headBranch: 'feature',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  createAIHandler: vi.fn(() => ({})),
  encodeSSE: vi.fn((data: string) => `data: ${data}\n\n`),
}));

describe('Ask API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MOCK_USER_ID', 'mock-user-id');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  });

  it('returns SSE stream on valid request', async () => {
    const { executeTool } = await import('@/lib/tools');
    const { fetchGitHubPR } = await import('@/app/api/utils');

    vi.mocked(fetchGitHubPR).mockResolvedValue({
      title: 'Test PR',
      description: 'A test PR',
      diff: 'some diff',
      files: [],
      author: 'testuser',
      baseBranch: 'main',
      headBranch: 'feature',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.mocked(executeTool).mockReturnValue(
      (async function* () {
        yield 'analysis result';
      })()
    );

    const { POST } = await import('@/app/api/ask/route');

    const request = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({ pr_url: 'https://github.com/owner/repo/pull/1', user_query: 'test' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('returns validation error when missing pr_url, diff, and user_query', async () => {
    const { POST } = await import('@/app/api/ask/route');

    const request = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when no auth header', async () => {
    const { POST } = await import('@/app/api/ask/route');

    const request = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pr_url: 'https://github.com/owner/repo/pull/1', user_query: 'test' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('falls back to mock data when GitHub PR fetch fails', async () => {
    const { executeTool } = await import('@/lib/tools');
    const { fetchGitHubPR } = await import('@/app/api/utils');

    vi.mocked(fetchGitHubPR).mockRejectedValue(new Error('GitHub API error'));
    vi.mocked(executeTool).mockReturnValue(
      (async function* () {
        yield 'mock fallback result';
      })()
    );

    const { POST } = await import('@/app/api/ask/route');

    const request = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({ pr_url: 'https://github.com/owner/repo/pull/1', user_query: 'test' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });
});
