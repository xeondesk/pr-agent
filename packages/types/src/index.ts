// PR data structure
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

export interface PullFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch?: string;
}

// Message types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolUsed?: string;
}

// Tool types
export interface ToolInput {
  prData: PRData;
  context?: string;
  userQuery?: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Agent types
export interface AgentInput {
  prData: PRData;
  toolName: string;
  userQuery?: string;
  history?: Message[];
}

export interface AgentOutput {
  success: boolean;
  message: Message;
  error?: string;
}

// Streaming chunk
export interface StreamChunk {
  type: 'start' | 'content' | 'error' | 'done';
  data?: string;
  error?: string;
}

// AI Handler types
export interface AIResponse {
  content: string;
  tokensUsed: number;
}

export interface AIStreamResponse {
  stream: AsyncGenerator<string, void, unknown>;
  tokensUsed: number;
}
