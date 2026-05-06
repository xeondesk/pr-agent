import crypto from 'crypto';

export interface GitHubWebhookPayload {
  action: string;
  pull_request?: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    head: {
      sha: string;
      ref: string;
      repo: {
        clone_url: string;
      };
    };
    base: {
      ref: string;
    };
    user: {
      login: string;
    };
    created_at: string;
    updated_at: string;
    html_url: string;
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    owner: {
      login: string;
      type: 'User' | 'Organization';
    };
  };
}

export interface WebhookConfig {
  id: string;
  repoFullName: string;
  webhookUrl: string;
  secret: string;
  enabled: boolean;
  autoReview: boolean;
  autoDescribe: boolean;
  autoImprove: boolean;
  postComments: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  webhookConfigId: string;
  prNumber: number;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tools: string[];
  results?: Record<string, string>;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  const expectedSignature = `sha256=${hash}`;
  
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
