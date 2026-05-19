import type { PRData } from './types';
import { OpenAIHandler } from './aiHandler';

export interface CapabilityConfig {
  name: string;
  description: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface CapabilityInput {
  prData: PRData;
  userQuery?: string;
  context?: Record<string, any>;
}

export interface CapabilityResult {
  capability: string;
  content: string;
  metadata?: {
    tokensUsed?: number;
    executionTime?: number;
    confidence?: number;
  };
}

export abstract class Capability {
  readonly name: string;
  readonly description: string;
  protected aiHandler: OpenAIHandler;
  protected config: CapabilityConfig;

  constructor(config: CapabilityConfig, aiHandler: OpenAIHandler) {
    this.name = config.name;
    this.description = config.description;
    this.config = config;
    this.aiHandler = aiHandler;
  }

  abstract generatePrompt(input: CapabilityInput): string;

  async execute(input: CapabilityInput): Promise<CapabilityResult> {
    const startTime = Date.now();
    const prompt = this.generatePrompt(input);
    
    const response = await this.aiHandler.complete(prompt, this.config.systemPrompt);
    
    return {
      capability: this.name,
      content: response,
      metadata: {
        executionTime: Date.now() - startTime,
      },
    };
  }

  async *executeStream(input: CapabilityInput): AsyncGenerator<string> {
    const prompt = this.generatePrompt(input);
    yield* this.aiHandler.streamCompletion(prompt, this.config.systemPrompt);
  }
}

// Concrete Capability Implementations

export class CodeReviewCapability extends Capability {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'CodeReview',
        description: 'Comprehensive code quality and architectural review',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: 'You are an expert code reviewer. Focus on code quality, maintainability, security, and performance.',
      },
      aiHandler
    );
  }

  generatePrompt(input: CapabilityInput): string {
    const { prData, userQuery } = input;
    const diff = prData.diff.slice(0, 3000); // Truncate for token limits

    return `${this.config.systemPrompt}

Review the following pull request changes:

Title: ${prData.title}
Description: ${prData.description}

Diff:
\`\`\`
${diff}
\`\`\`

Provide a detailed review covering:
1. Code quality and style issues
2. Potential bugs or edge cases
3. Performance considerations
4. Security concerns
5. Architectural improvements

${userQuery ? `\nAdditional focus: ${userQuery}` : ''}`;
  }
}

export class DescriptionCapability extends Capability {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'Description',
        description: 'Generate concise PR description and summary',
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 1024,
        systemPrompt: 'You are a technical writer. Create clear, concise, and accurate summaries.',
      },
      aiHandler
    );
  }

  generatePrompt(input: CapabilityInput): string {
    const { prData } = input;
    const diff = prData.diff.slice(0, 2000);

    return `${this.config.systemPrompt}

Summarize this pull request in a clear and concise manner:

Title: ${prData.title}
Current Description: ${prData.description}

Changes:
\`\`\`
${diff}
\`\`\`

Provide:
1. What changed (in 2-3 sentences)
2. Why it changed
3. How to test it
4. Any breaking changes`;
  }
}

export class SecurityCapability extends Capability {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'Security',
        description: 'Security-focused analysis and vulnerability detection',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 2048,
        systemPrompt: 'You are a security expert. Identify vulnerabilities, security risks, and compliance issues.',
      },
      aiHandler
    );
  }

  generatePrompt(input: CapabilityInput): string {
    const { prData } = input;
    const diff = prData.diff.slice(0, 3000);

    return `${this.config.systemPrompt}

Analyze this code for security issues:

\`\`\`
${diff}
\`\`\`

Check for:
1. SQL injection vulnerabilities
2. XSS/injection attacks
3. Authentication/authorization issues
4. Cryptographic weaknesses
5. Data exposure risks
6. Third-party dependency vulnerabilities

Rate severity (Critical/High/Medium/Low) for each issue.`;
  }
}

export class PerformanceCapability extends Capability {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'Performance',
        description: 'Performance analysis and optimization suggestions',
        model: 'gpt-4',
        temperature: 0.6,
        maxTokens: 2048,
        systemPrompt: 'You are a performance optimization expert. Identify bottlenecks and suggest improvements.',
      },
      aiHandler
    );
  }

  generatePrompt(input: CapabilityInput): string {
    const { prData } = input;
    const diff = prData.diff.slice(0, 3000);

    return `${this.config.systemPrompt}

Analyze this code for performance issues:

\`\`\`
${diff}
\`\`\`

Identify:
1. O(n²) or worse algorithms
2. Memory leaks or inefficient allocations
3. Database query optimization opportunities
4. Caching opportunities
5. Network request optimization
6. Frontend performance issues

For each issue, suggest specific optimizations.`;
  }
}

export class TestabilityCapability extends Capability {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'Testability',
        description: 'Test coverage and testability analysis',
        model: 'gpt-4',
        temperature: 0.6,
        maxTokens: 2048,
        systemPrompt: 'You are a test engineering expert. Evaluate test coverage and suggest test cases.',
      },
      aiHandler
    );
  }

  generatePrompt(input: CapabilityInput): string {
    const { prData } = input;
    const diff = prData.diff.slice(0, 3000);

    return `${this.config.systemPrompt}

Review test coverage for these changes:

\`\`\`
${diff}
\`\`\`

Provide:
1. What should be tested
2. Edge cases to cover
3. Suggested test cases (in pseudo-code or actual code)
4. Integration test scenarios
5. Areas that need more coverage`;
  }
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  register(capability: Capability): void {
    this.capabilities.set(capability.name, capability);
  }

  get(name: string): Capability | undefined {
    return this.capabilities.get(name);
  }

  list(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  async executeCapability(
    name: string,
    input: CapabilityInput
  ): Promise<CapabilityResult> {
    const capability = this.get(name);
    if (!capability) {
      throw new Error(`Capability ${name} not found`);
    }
    return capability.execute(input);
  }

  async *streamCapability(
    name: string,
    input: CapabilityInput
  ): AsyncGenerator<string> {
    const capability = this.get(name);
    if (!capability) {
      throw new Error(`Capability ${name} not found`);
    }
    yield* capability.executeStream(input);
  }

  async executeMultiple(
    names: string[],
    input: CapabilityInput
  ): Promise<CapabilityResult[]> {
    const results = await Promise.all(
      names.map((name) => this.executeCapability(name, input))
    );
    return results;
  }
}

// Factory function to create a preconfigured registry
export function createCapabilityRegistry(aiHandler: OpenAIHandler): CapabilityRegistry {
  const registry = new CapabilityRegistry();

  registry.register(new CodeReviewCapability(aiHandler));
  registry.register(new DescriptionCapability(aiHandler));
  registry.register(new SecurityCapability(aiHandler));
  registry.register(new PerformanceCapability(aiHandler));
  registry.register(new TestabilityCapability(aiHandler));

  return registry;
}
