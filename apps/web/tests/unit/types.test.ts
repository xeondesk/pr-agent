import { describe, it, expect } from 'vitest';
import type {
  ApiRequest,
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginationParams,
  PaginatedResponse,
} from '@/lib/api/types';

describe('ApiRequest type', () => {
  it('creates valid typed request object', () => {
    const req: ApiRequest<{ name: string }> = {
      body: { name: 'test' },
      userId: 'user-1',
      userRole: 'user',
      requestId: 'req-1',
      token: 'tok-1',
    };
    expect(req.body.name).toBe('test');
    expect(req.userRole).toBe('user');
  });

  it('supports admin role', () => {
    const req: ApiRequest = {
      body: {},
      userId: 'admin-1',
      userRole: 'admin',
      requestId: 'req-2',
      token: 'tok-2',
    };
    expect(req.userRole).toBe('admin');
  });
});

describe('ApiSuccessResponse type', () => {
  it('creates success response', () => {
    const res: ApiSuccessResponse<string> = {
      status: 'success',
      data: 'hello',
    };
    expect(res.status).toBe('success');
    expect(res.data).toBe('hello');
  });
});

describe('ApiErrorResponse type', () => {
  it('creates error response', () => {
    const res: ApiErrorResponse = {
      status: 'error',
      error: { code: 'NOT_FOUND', message: 'Not found' },
    };
    expect(res.status).toBe('error');
    expect(res.error.code).toBe('NOT_FOUND');
  });
});

describe('PaginationParams', () => {
  it('calculates offset', () => {
    const p: PaginationParams = { page: 2, limit: 20, offset: 20 };
    expect(p.offset).toBe(20);
    expect(p.page).toBe(2);
  });
});

describe('PaginatedResponse', () => {
  it('creates paginated response', () => {
    const res: PaginatedResponse<number> = {
      items: [1, 2, 3],
      total: 100,
      page: 1,
      limit: 10,
      hasMore: true,
    };
    expect(res.items).toHaveLength(3);
    expect(res.hasMore).toBe(true);
  });
});
