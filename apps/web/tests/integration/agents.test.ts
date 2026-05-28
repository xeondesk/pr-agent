import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/agents', () => ({
  AgentOrchestrator: vi.fn(),
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

describe('Agents API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MOCK_USER_ID', 'mock-user-id');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  });

  describe('POST', () => {
    it('returns SSE stream with agent results', async () => {
      const { fetchGitHubPR } = await import('@/app/api/utils');
      const { AgentOrchestrator } = await import('@/lib/agents');

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

      const mockExecuteAll = vi.fn().mockResolvedValue({
        agents: [
          {
            agent: 'code_review',
            status: 'success',
            results: { issues: ['minor typo'] },
            executionTime: 100,
          },
        ],
        summary: 'Review complete',
      });

      (vi.mocked(AgentOrchestrator) as any).mockImplementation(class {
        executeAll = mockExecuteAll;
      });

      const { POST } = await import('@/app/api/agents/route');

      const request = new NextRequest('http://localhost/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ pr_url: 'https://github.com/owner/repo/pull/1' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('returns 400 for invalid mode', async () => {
      const { POST } = await import('@/app/api/agents/route');

      const request = new NextRequest('http://localhost/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ pr_url: 'https://github.com/owner/repo/pull/1', mode: 'invalid' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 without auth', async () => {
      const { POST } = await import('@/app/api/agents/route');

      const request = new NextRequest('http://localhost/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr_url: 'https://github.com/owner/repo/pull/1' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe('GET', () => {
    it('returns list of agents', async () => {
      const { AgentOrchestrator } = await import('@/lib/agents');

      const mockListAgents = vi.fn().mockReturnValue([
        { name: 'code_review', description: 'Review code' },
      ]);

      (vi.mocked(AgentOrchestrator) as any).mockImplementation(class {
        listAgents = mockListAgents;
      });

      const { GET } = await import('@/app/api/agents/route');

      const request = new NextRequest('http://localhost/api/agents', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.agents).toBeDefined();
    });
  });
});
