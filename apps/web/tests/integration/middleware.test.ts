import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';

describe('API Middleware', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MOCK_USER_ID', 'mock-user-id');
  });

  it('passes validated data to handler', async () => {
    const { withAuth } = await import('@/lib/api/middleware');
    const schema = z.object({ name: z.string() });

    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const wrapped = withAuth(schema, handler);
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({ name: 'test' }),
    });

    const response = await wrapped(request);
    expect(response.status).toBe(200);

    expect(handler).toHaveBeenCalledOnce();
    const apiReq = handler.mock.calls[0][0];
    expect(apiReq.body).toEqual({ name: 'test' });
    expect(apiReq.userId).toBe('mock-user-id');
    expect(apiReq.requestId).toBeTruthy();
  });

  it('returns 400 for invalid body', async () => {
    const { withAuth } = await import('@/lib/api/middleware');
    const schema = z.object({ name: z.string() });

    const handler = vi.fn();
    const wrapped = withAuth(schema, handler);

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({ name: 123 }),
    });

    const response = await wrapped(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when no auth header', async () => {
    const { withAuth } = await import('@/lib/api/middleware');
    const schema = z.object({});

    const handler = vi.fn();
    const wrapped = withAuth(schema, handler);

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await wrapped(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const { withAuth } = await import('@/lib/api/middleware');
    const schema = z.object({});

    const handler = vi.fn();
    const wrapped = withAuth(schema, handler);

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: 'not-json',
    });

    const response = await wrapped(request);
    expect(response.status).toBe(400);
  });

  it('withMiddleware works without auth', async () => {
    const { withMiddleware } = await import('@/lib/api/middleware');
    const schema = z.object({});

    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const wrapped = withMiddleware(schema, handler);
    const request = new Request('http://localhost/api/test', {
      method: 'GET',
    });

    const response = await wrapped(request);
    expect(response.status).toBe(200);
  });
});
