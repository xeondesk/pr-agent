import { describe, it, expect } from 'vitest';
import {
  verifyGitHubWebhookSignature,
  verifyWebhookTimestamp,
  validateWebhookEvent,
  generateWebhookSecret,
  encryptWebhookData,
  decryptWebhookData,
} from '@/lib/webhooks/security';
import crypto from 'crypto';

describe('Webhook Security', () => {
  describe('verifyGitHubWebhookSignature', () => {
    it('verifies valid GitHub webhook signature', () => {
      const secret = 'test-secret';
      const payload = JSON.stringify({ action: 'opened', pull_request: { id: 1 } });

      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const result = verifyGitHubWebhookSignature(payload, `sha256=${signature}`, secret);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects invalid signature', () => {
      const secret = 'test-secret';
      const payload = JSON.stringify({ action: 'opened' });

      const result = verifyGitHubWebhookSignature(payload, 'sha256=invalid', secret);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects malformed signature format', () => {
      const result = verifyGitHubWebhookSignature('payload', 'invalid-format', 'secret');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature format');
    });

    it('uses timing-safe comparison', () => {
      const secret = 'test-secret';
      const payload = 'test-payload';

      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Should not throw even with very similar but invalid signature
      const result = verifyGitHubWebhookSignature(
        payload,
        `sha256=${signature.slice(0, -1)}0`,
        secret
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('verifyWebhookTimestamp', () => {
    it('accepts recent timestamp', () => {
      const now = new Date().toISOString();
      const result = verifyWebhookTimestamp(now);

      expect(result.valid).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('rejects timestamp older than 5 minutes', () => {
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const result = verifyWebhookTimestamp(oldTimestamp);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too old');
    });

    it('rejects future timestamp', () => {
      const futureTimestamp = new Date(Date.now() + 6 * 60 * 1000).toISOString();
      const result = verifyWebhookTimestamp(futureTimestamp);

      expect(result.valid).toBe(false);
    });

    it('handles invalid timestamp format', () => {
      const result = verifyWebhookTimestamp('invalid-date');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateWebhookEvent', () => {
    it('validates complete PR opened event', () => {
      const event = {
        action: 'opened',
        repository: { full_name: 'owner/repo' },
        pull_request: { id: 1, number: 1 },
      };

      const result = validateWebhookEvent(event);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects event without action', () => {
      const event = {
        repository: { full_name: 'owner/repo' },
        pull_request: { id: 1 },
      };

      const result = validateWebhookEvent(event);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('action');
    });

    it('rejects event without repository', () => {
      const event = {
        action: 'opened',
        pull_request: { id: 1 },
      };

      const result = validateWebhookEvent(event);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('repository');
    });

    it('rejects event without repository full_name', () => {
      const event = {
        action: 'opened',
        repository: {},
        pull_request: { id: 1 },
      };

      const result = validateWebhookEvent(event);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('full_name');
    });

    it('rejects PR event without pull_request field', () => {
      const event = {
        action: 'opened',
        repository: { full_name: 'owner/repo' },
      };

      const result = validateWebhookEvent(event);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('pull_request');
    });

    it('allows push event without pull_request', () => {
      const event = {
        action: 'push',
        repository: { full_name: 'owner/repo' },
      };

      const result = validateWebhookEvent(event);

      expect(result.valid).toBe(true);
    });

    it('rejects non-object data', () => {
      const result = validateWebhookEvent(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid event data');
    });
  });

  describe('Encryption', () => {
    it('encrypts and decrypts data', () => {
      const encryptionKey = crypto.randomBytes(32).toString('hex');
      const originalData = { secret: 'sensitive-data', user: 'test' };

      const encrypted = encryptWebhookData(originalData, encryptionKey);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toContain(JSON.stringify(originalData));

      const decrypted = decryptWebhookData(encrypted, encryptionKey);

      expect(decrypted).toEqual(originalData);
    });

    it('fails to decrypt with wrong key', () => {
      const encryptionKey = crypto.randomBytes(32).toString('hex');
      const wrongKey = crypto.randomBytes(32).toString('hex');
      const originalData = { secret: 'sensitive-data' };

      const encrypted = encryptWebhookData(originalData, encryptionKey);

      expect(() => decryptWebhookData(encrypted, wrongKey)).toThrow();
    });

    it('handles corrupted encrypted data', () => {
      const encryptionKey = crypto.randomBytes(32).toString('hex');

      expect(() => decryptWebhookData('corrupted:data:here', encryptionKey)).toThrow();
    });
  });

  describe('Secret Generation', () => {
    it('generates secure webhook secret', () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();

      expect(secret1).toBeDefined();
      expect(secret2).toBeDefined();
      expect(secret1).not.toBe(secret2);
      expect(secret1.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('generates cryptographically secure secrets', () => {
      const secrets = new Set();

      for (let i = 0; i < 100; i++) {
        secrets.add(generateWebhookSecret());
      }

      // All secrets should be unique
      expect(secrets.size).toBe(100);
    });
  });
});
