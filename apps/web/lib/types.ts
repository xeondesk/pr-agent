export interface PullFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
  patch?: string;
}

export interface PRData {
  url: string;
  title: string;
  description: string;
  diff: string;
  files: PullFile[];
  author: string;
  baseBranch: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolInput {
  prData: PRData;
  context: string;
  userQuery: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolName?: string;
}

export interface AgentInput {
  prData: PRData;
  toolName: string;
  userQuery: string;
}

export interface AgentOutput {
  content: string;
  tokensUsed: number;
}

export interface WebhookStatus {
  eventId: string;
  repoFullName: string;
  prNumber: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tools: string[];
  results?: Record<string, string>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CapabilityInput {
  prData: PRData;
  userQuery?: string;
  context?: Record<string, any>;
}
