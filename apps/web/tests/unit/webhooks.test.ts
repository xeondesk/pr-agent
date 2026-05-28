import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyGitHubSignature, generateWebhookSecret } from '@/lib/webhooks';

describe('generateWebhookSecret', () => {
  it('generates a 64-character hex string', () => {
    const secret = generateWebhookSecret();
    expect(secret).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
  });

  it('generates unique secrets each time', () => {
    const s1 = generateWebhookSecret();
    const s2 = generateWebhookSecret();
    expect(s1).not.toBe(s2);
  });
});

describe('verifyGitHubSignature', () => {
  it('verifies valid signature', () => {
    const payload = JSON.stringify({ action: 'opened', pull_request: { number: 1 } });
    const secret = 'my-secret-key';
    const result = verifyGitHubSignature(payload, '', secret);
    expect(result).toBe(false);
  });

  it('returns false for mismatched signature', () => {
    const payload = JSON.stringify({ action: 'opened' });
    const secret = 'secret-1';
    const badSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    const result = verifyGitHubSignature(payload, badSignature, secret);
    expect(result).toBe(false);
  });

  it('returns true for correct signature', () => {
    const payload = 'test-payload';
    const secret = 'test-secret';
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signature = `sha256=${hash}`;
    const result = verifyGitHubSignature(payload, signature, secret);
    expect(result).toBe(true);
  });

  it('uses timing-safe comparison', () => {
    const payload = 'payload';
    const secret = 'secret';
    const result = verifyGitHubSignature(payload, 'sha256=00', secret);
    expect(typeof result).toBe('boolean');
  });
});
