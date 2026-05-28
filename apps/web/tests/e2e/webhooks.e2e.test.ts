import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

/**
 * End-to-End Tests for Webhook Processing
 * Tests complete workflow from GitHub to event processing
 */

describe('E2E: Webhook Processing Flow', () => {
  let webhookSecret: string;
  let userId: string;
  let webhookConfigId: string;
  let testPayload: any;

  beforeEach(async () => {
    // Setup test data
    webhookSecret = 'test-webhook-secret-12345';
    userId = 'test-user-uuid';
    webhookConfigId = 'test-config-uuid';

    testPayload = {
      action: 'opened',
      number: 42,
      pull_request: {
        id: 123456,
        number: 42,
        title: 'Add new feature',
        body: 'This PR adds a new feature',
        html_url: 'https://github.com/test/repo/pull/42',
        head: {
          ref: 'feature-branch',
          sha: 'abc123def456',
        },
        base: {
          ref: 'main',
          sha: 'main123',
        },
        user: {
          login: 'testuser',
          avatar_url: 'https://avatars.githubusercontent.com/...',
        },
      },
      repository: {
        id: 987654,
        full_name: 'test/repo',
        html_url: 'https://github.com/test/repo',
      },
    };
  });

  describe('Webhook Signature Verification', () => {
    it('accepts webhook with valid signature', async () => {
      const payload = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      // Simulate webhook request
      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(202); // Accepted
      const data = await response.json();
      expect(data.eventId).toBeDefined();
    });

    it('rejects webhook with invalid signature', async () => {
      const payload = JSON.stringify(testPayload);
      const invalidSignature = 'sha256=invalid_signature_here';

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': invalidSignature,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(401); // Unauthorized
    });

    it('rejects webhook without signature', async () => {
      const payload = JSON.stringify(testPayload);

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(401); // Unauthorized
    });
  });

  describe('Webhook Event Processing', () => {
    it('processes PR opened event', async () => {
      const payload = JSON.stringify({
        ...testPayload,
        action: 'opened',
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data.message).toContain('queued for processing');
    });

    it('processes PR synchronize event', async () => {
      const payload = JSON.stringify({
        ...testPayload,
        action: 'synchronize',
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(202);
    });
  });

  describe('Idempotency & Replay Attack Prevention', () => {
    it('prevents duplicate processing of same delivery', async () => {
      const deliveryId = crypto.randomUUID();
      const payload = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      // First request
      const response1 = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': deliveryId,
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response1.status).toBe(202);
      const data1 = await response1.json();

      // Second request with same delivery ID
      const response2 = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': deliveryId,
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response2.status).toBe(200); // Already processed
    });

    it('rejects old webhook timestamps', async () => {
      const payload = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      // Old timestamp (6 minutes ago)
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': oldTimestamp,
        },
        body: payload,
      });

      expect(response.status).toBe(400); // Bad Request - timestamp too old
    });
  });

  describe('Event Validation', () => {
    it('rejects malformed JSON', async () => {
      const malformedPayload = 'not-valid-json{';
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(malformedPayload)
        .digest('hex');

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: malformedPayload,
      });

      expect(response.status).toBe(400);
    });

    it('rejects webhook without repository field', async () => {
      const payload = JSON.stringify({
        action: 'opened',
        pull_request: { id: 123 },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(400);
    });

    it('rejects webhook without pull_request field for PR events', async () => {
      const payload = JSON.stringify({
        action: 'opened',
        repository: { full_name: 'test/repo' },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const response = await fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Webhook Status Monitoring', () => {
    it('returns webhook processing status', async () => {
      const response = await fetch('http://localhost:3000/api/webhooks/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.stats).toBeDefined();
      expect(data.stats.pending).toBeDefined();
      expect(data.stats.success).toBeDefined();
      expect(data.stats.deadLetter).toBeDefined();
    });

    it('returns dead letter events when requested', async () => {
      const response = await fetch('http://localhost:3000/api/webhooks/status?includeDeadLetters=true', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.deadLetterEvents)).toBe(true);
    });
  });

  describe('Database Persistence', () => {
    it('persists webhook configuration', async () => {
      const config = {
        repository_name: 'test/repo',
        auto_review: true,
        auto_describe: true,
        auto_improve: false,
        post_comments: true,
      };

      const response = await fetch('http://localhost:3000/api/webhooks/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN}`,
        },
        body: JSON.stringify(config),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.repository_name).toBe('test/repo');
    });

    it('retrieves webhook configuration', async () => {
      const response = await fetch('http://localhost:3000/api/webhooks/config', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.configs)).toBe(true);
    });
  });

  afterEach(async () => {
    // Cleanup
    vi.clearAllMocks();
  });
});

describe('E2E: API Route Integration', () => {
  it('handles concurrent webhook requests', async () => {
    const requests = Array.from({ length: 10 }, (_, i) => {
      const payload = JSON.stringify({
        action: 'opened',
        number: 100 + i,
        pull_request: { id: 1000 + i, number: 100 + i },
        repository: { full_name: 'test/repo' },
      });

      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(payload)
        .digest('hex');

      return fetch('http://localhost:3000/api/webhooks/github-secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-delivery': crypto.randomUUID(),
          'x-github-delivery-timestamp': new Date().toISOString(),
        },
        body: payload,
      });
    });

    const responses = await Promise.all(requests);
    const successCount = responses.filter(r => r.status === 202).length;

    expect(successCount).toBe(10);
  });

  it('maintains database consistency under load', async () => {
    const operations = [];

    // Create 50 concurrent database writes
    for (let i = 0; i < 50; i++) {
      operations.push(
        fetch('http://localhost:3000/api/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN}`,
          },
          body: JSON.stringify({
            title: `Test Conversation ${i}`,
            description: 'Test description',
          }),
        })
      );
    }

    const responses = await Promise.all(operations);
    const successCount = responses.filter(r => r.status === 201).length;

    expect(successCount).toBe(50);

    // Verify data was persisted
    const listResponse = await fetch('http://localhost:3000/api/conversations', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN}`,
      },
    });

    const data = await listResponse.json();
    expect(data.conversations.length).toBeGreaterThanOrEqual(50);
  });
});
