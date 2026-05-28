import { describe, it, expect } from 'vitest';
import {
  askRequestSchema,
  reviewRequestSchema,
  describeRequestSchema,
  improveRequestSchema,
  agentsRequestSchema,
  capabilitiesRequestSchema,
  webhookConfigRequestSchema,
  conversationCreateSchema,
  messageCreateSchema,
  feedbackCreateSchema,
} from '@/lib/api/schemas';

describe('askRequestSchema', () => {
  it('validates with prUrl and userQuery', () => {
    const result = askRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
      userQuery: 'What does this PR do?',
    });
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/123');
    expect(result.userQuery).toBe('What does this PR do?');
  });

  it('rejects missing both prUrl and diff', () => {
    expect(() => askRequestSchema.parse({ userQuery: 'test' })).toThrow();
  });

  it('rejects invalid PR URL', () => {
    expect(() =>
      askRequestSchema.parse({ prUrl: 'not-a-url', userQuery: 'test' })
    ).toThrow();
  });

  it('rejects empty userQuery', () => {
    expect(() =>
      askRequestSchema.parse({
        prUrl: 'https://github.com/owner/repo/pull/123',
        userQuery: '',
      })
    ).toThrow();
  });

  it('rejects too-long userQuery', () => {
    expect(() =>
      askRequestSchema.parse({
        prUrl: 'https://github.com/owner/repo/pull/123',
        userQuery: 'x'.repeat(5001),
      })
    ).toThrow();
  });

  it('accepts diff without prUrl', () => {
    const result = askRequestSchema.parse({
      diff: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new',
      userQuery: 'Review this diff',
    });
    expect(result.diff).toBeTruthy();
    expect(result.userQuery).toBe('Review this diff');
  });

  it('rejects non-github PR URL', () => {
    expect(() =>
      askRequestSchema.parse({
        prUrl: 'https://gitlab.com/owner/repo/pull/1',
        userQuery: 'test',
      })
    ).toThrow();
  });
});

describe('reviewRequestSchema', () => {
  it('validates minimal request', () => {
    const result = reviewRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
    });
    expect(result.prUrl).toBeTruthy();
  });

  it('makes userQuery optional', () => {
    const result = reviewRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
    });
    expect(result.userQuery).toBeUndefined();
  });
});

describe('describeRequestSchema', () => {
  it('validates with prUrl', () => {
    const result = describeRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
    });
    expect(result.prUrl).toBeTruthy();
  });
});

describe('improveRequestSchema', () => {
  it('validates with prUrl', () => {
    const result = improveRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
    });
    expect(result.prUrl).toBeTruthy();
  });
});

describe('agentsRequestSchema', () => {
  it('defaults mode to all', () => {
    const result = agentsRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
    });
    expect(result.mode).toBe('all');
  });

  it('accepts valid modes', () => {
    for (const mode of ['all', 'high', 'medium', 'low'] as const) {
      const result = agentsRequestSchema.parse({
        prUrl: 'https://github.com/owner/repo/pull/123',
        mode,
      });
      expect(result.mode).toBe(mode);
    }
  });

  it('rejects invalid mode', () => {
    expect(() =>
      agentsRequestSchema.parse({
        prUrl: 'https://github.com/owner/repo/pull/123',
        mode: 'invalid',
      })
    ).toThrow();
  });
});

describe('capabilitiesRequestSchema', () => {
  it('accepts single capability string', () => {
    const result = capabilitiesRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
      capabilities: 'CodeReview',
    });
    expect(result.capabilities).toBe('CodeReview');
  });

  it('accepts array of capabilities', () => {
    const result = capabilitiesRequestSchema.parse({
      prUrl: 'https://github.com/owner/repo/pull/123',
      capabilities: ['CodeReview', 'Security'],
    });
    expect(Array.isArray(result.capabilities)).toBe(true);
  });
});

describe('webhookConfigRequestSchema', () => {
  it('validates with required fields', () => {
    const result = webhookConfigRequestSchema.parse({
      repoFullName: 'owner/repo',
    });
    expect(result.repoFullName).toBe('owner/repo');
    expect(result.autoReview).toBe(true);
    expect(result.autoImprove).toBe(false);
  });

  it('rejects invalid repo format', () => {
    expect(() =>
      webhookConfigRequestSchema.parse({ repoFullName: 'invalid' })
    ).toThrow();
  });

  it('accepts optional boolean overrides', () => {
    const result = webhookConfigRequestSchema.parse({
      repoFullName: 'owner/repo',
      autoReview: false,
      autoDescribe: false,
      postComments: true,
    });
    expect(result.autoReview).toBe(false);
    expect(result.autoDescribe).toBe(false);
    expect(result.postComments).toBe(true);
  });
});

describe('conversationCreateSchema', () => {
  it('validates with title', () => {
    const result = conversationCreateSchema.parse({ title: 'My conversation' });
    expect(result.title).toBe('My conversation');
  });

  it('rejects empty title', () => {
    expect(() => conversationCreateSchema.parse({ title: '' })).toThrow();
  });
});

describe('messageCreateSchema', () => {
  it('validates valid message', () => {
    const result = messageCreateSchema.parse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'user',
      content: 'Hello',
    });
    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
  });

  it('rejects invalid UUID', () => {
    expect(() =>
      messageCreateSchema.parse({
        conversationId: 'not-a-uuid',
        role: 'user',
        content: 'test',
      })
    ).toThrow();
  });

  it('rejects invalid role', () => {
    expect(() =>
      messageCreateSchema.parse({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        role: 'admin',
        content: 'test',
      })
    ).toThrow();
  });
});

describe('feedbackCreateSchema', () => {
  it('validates feedback', () => {
    const result = feedbackCreateSchema.parse({
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      rating: 4,
      helpful: true,
    });
    expect(result.rating).toBe(4);
  });

  it('rejects out-of-range rating', () => {
    expect(() =>
      feedbackCreateSchema.parse({
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        rating: 6,
        helpful: true,
      })
    ).toThrow();
  });
});
