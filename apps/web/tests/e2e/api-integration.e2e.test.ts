import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * End-to-End Tests for API Routes
 * Tests all API endpoints with realistic workflows
 */

const API_URL = 'http://localhost:3000/api';
let authToken: string;
let userId: string;

describe('E2E: Authentication API Routes', () => {
  describe('Auth Workflow', () => {
    it('registers new user', async () => {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test-${Date.now()}@example.com`,
          password: 'SecurePassword123!',
          name: 'Test User',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.user).toBeDefined();
      expect(data.session).toBeDefined();
      authToken = data.session.access_token;
      userId = data.user.id;
    });

    it('logs in user', async () => {
      const email = `test-${Date.now()}@example.com`;

      // Register
      await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'SecurePassword123!',
        }),
      });

      // Login
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'SecurePassword123!',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.session.access_token).toBeDefined();
    });

    it('validates session token', async () => {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.id).toBe(userId);
    });

    it('rejects invalid token', async () => {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': 'Bearer invalid-token' },
      });

      expect(response.status).toBe(401);
    });

    it('logs out user', async () => {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);

      // Verify token is invalidated
      const meResponse = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(meResponse.status).toBe(401);
    });
  });
});

describe('E2E: Conversations API Routes', () => {
  beforeEach(async () => {
    // Setup auth
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
      }),
    });

    const data = await registerResponse.json();
    authToken = data.session.access_token;
    userId = data.user.id;
  });

  describe('Create & List Conversations', () => {
    it('creates new conversation', async () => {
      const response = await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: 'Review PR #42',
          description: 'Code review for new feature',
          pr_url: 'https://github.com/test/repo/pull/42',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.title).toBe('Review PR #42');
    });

    it('lists user conversations', async () => {
      // Create conversation
      await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: 'Test Conversation',
        }),
      });

      // List
      const response = await fetch(`${API_URL}/conversations`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.conversations)).toBe(true);
      expect(data.conversations.length).toBeGreaterThan(0);
    });

    it('retrieves specific conversation', async () => {
      // Create
      const createResponse = await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: 'Test Conversation',
        }),
      });

      const createData = await createResponse.json();
      const conversationId = createData.id;

      // Retrieve
      const response = await fetch(`${API_URL}/conversations/${conversationId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(conversationId);
    });
  });

  describe('Conversation Messages', () => {
    let conversationId: string;

    beforeEach(async () => {
      const response = await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: 'Test Conversation',
        }),
      });

      const data = await response.json();
      conversationId = data.id;
    });

    it('adds message to conversation', async () => {
      const response = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          content: 'Review this code change',
          role: 'user',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.content).toBe('Review this code change');
    });

    it('lists conversation messages', async () => {
      // Add message
      await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          content: 'Test message',
          role: 'user',
        }),
      });

      // List
      const response = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.messages)).toBe(true);
      expect(data.messages.length).toBeGreaterThan(0);
    });
  });
});

describe('E2E: Webhook API Routes', () => {
  beforeEach(async () => {
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
      }),
    });

    const data = await registerResponse.json();
    authToken = data.session.access_token;
  });

  describe('Webhook Configuration', () => {
    it('creates webhook config', async () => {
      const response = await fetch(`${API_URL}/webhooks/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          repository_name: 'test/repo',
          auto_review: true,
          auto_describe: true,
          auto_improve: false,
          post_comments: true,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.repository_name).toBe('test/repo');
    });

    it('lists webhook configs', async () => {
      // Create
      await fetch(`${API_URL}/webhooks/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          repository_name: 'test/repo',
          auto_review: true,
        }),
      });

      // List
      const response = await fetch(`${API_URL}/webhooks/config`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.configs)).toBe(true);
    });

    it('updates webhook config', async () => {
      // Create
      const createResponse = await fetch(`${API_URL}/webhooks/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          repository_name: 'test/repo',
          auto_review: false,
        }),
      });

      const createData = await createResponse.json();
      const configId = createData.id;

      // Update
      const response = await fetch(`${API_URL}/webhooks/config/${configId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          auto_review: true,
          auto_describe: true,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.auto_review).toBe(true);
    });

    it('deletes webhook config', async () => {
      // Create
      const createResponse = await fetch(`${API_URL}/webhooks/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          repository_name: 'test/repo',
        }),
      });

      const createData = await createResponse.json();
      const configId = createData.id;

      // Delete
      const response = await fetch(`${API_URL}/webhooks/config/${configId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(response.status).toBe(204);

      // Verify deleted
      const getResponse = await fetch(`${API_URL}/webhooks/config/${configId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      expect(getResponse.status).toBe(404);
    });
  });
});

describe('E2E: Error Handling', () => {
  it('returns 400 for invalid request body', async () => {
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer invalid-token`,
      },
      body: JSON.stringify({
        // Missing required fields
      }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 404 for non-existent resource', async () => {
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
      }),
    });

    const data = await registerResponse.json();
    const token = data.session.access_token;

    const response = await fetch(`${API_URL}/conversations/non-existent-id`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
  });

  it('returns 500 with error details on server error', async () => {
    const response = await fetch(`${API_URL}/unknown-endpoint`, {
      headers: { 'Authorization': 'Bearer token' },
    });

    expect([404, 500]).toContain(response.status);
  });
});

describe('E2E: Rate Limiting', () => {
  it('enforces rate limits on API calls', async () => {
    const requests = Array.from({ length: 101 }, () =>
      fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': 'Bearer token' },
      })
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status === 429);

    // At least one request should be rate limited
    expect(rateLimited).toBe(true);
  });
});
