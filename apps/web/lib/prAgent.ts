// Consolidated PR-Agent library for web app
// All types and functionality in one place to avoid monorepo resolution issues

import { encodingForModel } from 'js-tiktoken';

// ============== TYPES ==============
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

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolUsed?: string;
}

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

export interface AIResponse {
  content: string;
  tokensUsed: number;
}

export interface AIStreamResponse {
  stream: AsyncGenerator<string, void, unknown>;
  tokensUsed: number;
}

export interface AIHandlerConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============== UTILITIES ==============
export class TokenCounter {
  private enc: ReturnType<typeof encodingForModel>;

  constructor(model: string = 'gpt-4') {
    this.enc = encodingForModel(model as any);
  }

  countTokens(text: string): number {
    return this.enc.encode(text).length;
  }

  countMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0;
    for (const msg of messages) {
      total += this.countTokens(msg.role);
      total += this.countTokens(msg.content);
      total += 4; // message overhead
    }
    total += 2; // response metadata
    return total;
  }
}

export class PatchParser {
  parse(diff: string) {
    const patches: Array<{
      filename: string;
      additions: number;
      deletions: number;
      changes: number;
    }> = [];
    const lines = diff.split('\n');
    let currentFile = '';
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          patches.push({
            filename: currentFile,
            additions,
            deletions,
            changes: additions + deletions,
          });
        }
        const match = line.match(/b\/(.*?)$/);
        currentFile = match ? match[1] : 'unknown';
        additions = 0;
        deletions = 0;
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    if (currentFile) {
      patches.push({
        filename: currentFile,
        additions,
        deletions,
        changes: additions + deletions,
      });
    }

    return patches;
  }

  getSummary(diff: string) {
    const patches = this.parse(diff);
    return {
      files: patches.length,
      additions: patches.reduce((sum, p) => sum + p.additions, 0),
      deletions: patches.reduce((sum, p) => sum + p.deletions, 0),
    };
  }
}

export class Compression {
  static compressDiff(diff: string, contextLines: number = 1): string {
    const lines = diff.split('\n');
    const result: string[] = [];
    let contextCount = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || 
          line.startsWith('---') || line.startsWith('+++')) {
        result.push(line);
        continue;
      }

      if (line.startsWith('@@')) {
        result.push(line);
        contextCount = 0;
        continue;
      }

      if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
        result.push(line);
        contextCount = 0;
      } else if (line.startsWith(' ')) {
        if (contextCount < contextLines) {
          result.push(line);
          contextCount++;
        }
      } else if (line === '') {
        contextCount = 0;
      }
    }

    return result.join('\n');
  }

  static truncateDiff(diff: string, maxLines: number = 500): string {
    const lines = diff.split('\n');
    if (lines.length <= maxLines) {
      return diff;
    }

    const keepStart = Math.floor(maxLines / 2);
    const keepEnd = maxLines - keepStart;
    
    return [
      ...lines.slice(0, keepStart),
      '... (diff truncated) ...',
      ...lines.slice(-keepEnd),
    ].join('\n');
  }
}

// ============== AI HANDLER ==============
export class OpenAIHandler {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private tokenCounter: TokenCounter;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(config: AIHandlerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2048;
    this.tokenCounter = new TokenCounter(config.model);
  }

  async complete(messages: AIMessage[]): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices[0]?.message.content || '';
    const tokensUsed = data.usage?.total_tokens || this.tokenCounter.countMessages(messages);

    return { content, tokensUsed };
  }

  async stream(messages: AIMessage[]): Promise<AIStreamResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const stream = async function* () {
      const reader = response.body?.getReader();
      if (!reader) return;

      let buffer = '';
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            if (line === 'data: [DONE]') continue;

            try {
              const data = JSON.parse(line.slice(6)) as any;
              const content = data.choices[0]?.delta.content;
              if (content) yield content;
            } catch {
              // Skip malformed lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    const tokensUsed = this.tokenCounter.countMessages(messages);
    return { stream: stream(), tokensUsed };
  }
}

// ============== TOOLS ==============
export class BaseTool {
  protected aiHandler: OpenAIHandler;
  protected name: string;
  protected description: string;

  constructor(name: string, description: string, aiHandler: OpenAIHandler) {
    this.name = name;
    this.description = description;
    this.aiHandler = aiHandler;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return this.description;
  }

  generatePrompt(input: ToolInput): string {
    return '';
  }

  async execute(input: ToolInput): Promise<ToolResult> {
    try {
      const prompt = this.generatePrompt(input);
      const messages: AIMessage[] = [
        {
          role: 'system',
          content: 'You are an expert code reviewer analyzing pull requests. Be concise, actionable, and professional.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await this.aiHandler.complete(messages);
      return {
        success: true,
        output: response.content,
        metadata: { tokensUsed: response.tokensUsed },
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async *executeStream(input: ToolInput): AsyncGenerator<string, void, unknown> {
    try {
      const prompt = this.generatePrompt(input);
      const messages: AIMessage[] = [
        {
          role: 'system',
          content: 'You are an expert code reviewer analyzing pull requests. Be concise, actionable, and professional.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await this.aiHandler.stream(messages);
      yield* response.stream;
    } catch (error) {
      throw error;
    }
  }
}

export class ReviewTool extends BaseTool {
  constructor(aiHandler: OpenAIHandler) {
    super(
      'review',
      'Analyze and review the pull request, providing feedback on code quality, best practices, and potential issues',
      aiHandler
    );
  }

  generatePrompt(input: ToolInput): string {
    const { prData, userQuery } = input;
    const patchParser = new PatchParser();
    const summary = patchParser.getSummary(prData.diff);
    const compressedDiff = Compression.compressDiff(prData.diff);

    return `Please review the following pull request:

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}
Base Branch: ${prData.baseBranch} → Head Branch: ${prData.headBranch}

Change Summary:
- Files changed: ${summary.files}
- Lines added: ${summary.additions}
- Lines deleted: ${summary.deletions}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

${userQuery ? `Additional context: ${userQuery}` : ''}

Please provide:
1. Overall assessment of the changes
2. Code quality observations
3. Potential bugs or security issues
4. Best practices feedback
5. Suggestions for improvement
6. Approval recommendation`;
  }
}

export class DescribeTool extends BaseTool {
  constructor(aiHandler: OpenAIHandler) {
    super(
      'describe',
      'Generate a summary and description of the changes in the pull request',
      aiHandler
    );
  }

  generatePrompt(input: ToolInput): string {
    const { prData } = input;
    const compressedDiff = Compression.compressDiff(prData.diff);

    return `Analyze this pull request and provide a clear, concise description:

Title: ${prData.title}
Current Description: ${prData.description || '(No description provided)'}
Author: ${prData.author}

Files Changed: ${prData.files.map((f) => f.filename).join(', ')}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

Please provide:
1. A concise summary of what changes were made (2-3 sentences)
2. The purpose/motivation for these changes
3. Key modifications by file
4. Impact assessment
5. Whether this is a breaking change

Format as a helpful PR description that could improve the original.`;
  }
}

export class ImproveTool extends BaseTool {
  constructor(aiHandler: OpenAIHandler) {
    super(
      'improve',
      'Suggest improvements and refactoring opportunities for the code in the pull request',
      aiHandler
    );
  }

  generatePrompt(input: ToolInput): string {
    const { prData, userQuery } = input;
    const compressedDiff = Compression.compressDiff(prData.diff);

    return `Analyze this pull request and suggest specific improvements:

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

${userQuery ? `Focus area: ${userQuery}` : ''}

Please provide specific, actionable improvement suggestions:
1. Code style and consistency improvements
2. Performance optimizations
3. Readability enhancements
4. DRY principle violations
5. Error handling improvements
6. Type safety enhancements
7. Testing suggestions`;
  }
}

export class AskTool extends BaseTool {
  constructor(aiHandler: OpenAIHandler) {
    super('ask', 'Answer specific questions about the pull request', aiHandler);
  }

  generatePrompt(input: ToolInput): string {
    const { prData, userQuery } = input;
    const compressedDiff = Compression.compressDiff(prData.diff);

    if (!userQuery) {
      return `Unable to process ask request: no question provided`;
    }

    return `Answer the following question about this pull request:

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

Question: ${userQuery}

Please provide a clear, detailed answer based on the code changes shown in the diff.`;
  }
}

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool): void {
    this.tools.set(tool.getName(), tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  listTools(): Array<{ name: string; description: string }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.getName(),
      description: tool.getDescription(),
    }));
  }
}

// ============== AGENT ==============
export class ReviewAgent {
  private toolRegistry: ToolRegistry;
  private aiHandler: OpenAIHandler;

  constructor(aiHandler: OpenAIHandler) {
    this.aiHandler = aiHandler;
    this.toolRegistry = new ToolRegistry();
    this.registerTools();
  }

  private registerTools(): void {
    this.toolRegistry.register(new ReviewTool(this.aiHandler));
    this.toolRegistry.register(new DescribeTool(this.aiHandler));
    this.toolRegistry.register(new ImproveTool(this.aiHandler));
    this.toolRegistry.register(new AskTool(this.aiHandler));
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      const tool = this.toolRegistry.get(input.toolName);

      if (!tool) {
        return {
          success: false,
          message: {
            id: Math.random().toString(36).slice(2),
            role: 'assistant',
            content: `Tool "${input.toolName}" not found. Available tools: ${this.toolRegistry
              .listTools()
              .map((t) => t.name)
              .join(', ')}`,
            timestamp: Date.now(),
          },
          error: `Tool not found: ${input.toolName}`,
        };
      }

      const result = await tool.execute({
        prData: input.prData,
        context: input.userQuery,
        userQuery: input.userQuery,
      });

      if (!result.success) {
        return {
          success: false,
          message: {
            id: Math.random().toString(36).slice(2),
            role: 'assistant',
            content: `Error executing ${input.toolName}: ${result.error}`,
            timestamp: Date.now(),
          },
          error: result.error,
        };
      }

      return {
        success: true,
        message: {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: result.output,
          timestamp: Date.now(),
          toolUsed: input.toolName,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: `Error: ${errorMsg}`,
          timestamp: Date.now(),
        },
        error: errorMsg,
      };
    }
  }

  async executeStream(input: AgentInput): Promise<AsyncGenerator<string, void, unknown>> {
    const self = this;
    return (async function* () {
      try {
        const tool = self.toolRegistry.get(input.toolName);

        if (!tool) {
          yield `Tool "${input.toolName}" not found. Available tools: ${self.toolRegistry
            .listTools()
            .map((t) => t.name)
            .join(', ')}`;
          return;
        }

        yield* tool.executeStream({
          prData: input.prData,
          context: input.userQuery,
          userQuery: input.userQuery,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        yield `Error: ${errorMsg}`;
      }
    })();
  }
}
