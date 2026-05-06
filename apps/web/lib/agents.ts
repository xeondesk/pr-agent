import type { CapabilityInput } from './types';
import { OpenAIHandler } from './aiHandler';

export interface AgentConfig {
  name: string;
  description: string;
  capabilities: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface AgentResult {
  agent: string;
  results: Record<string, string>;
  executionTime: number;
  status: 'success' | 'error';
  error?: string;
}

export interface AgentOrchestratorResult {
  agents: AgentResult[];
  summary: {
    totalTime: number;
    successCount: number;
    failureCount: number;
    criticalIssues: string[];
    recommendations: string[];
  };
}

export abstract class Agent {
  readonly name: string;
  readonly description: string;
  readonly capabilities: string[];
  readonly priority: 'high' | 'medium' | 'low';
  protected aiHandler: OpenAIHandler;

  constructor(config: AgentConfig, aiHandler: OpenAIHandler) {
    this.name = config.name;
    this.description = config.description;
    this.capabilities = config.capabilities;
    this.priority = config.priority;
    this.aiHandler = aiHandler;
  }

  abstract analyze(input: CapabilityInput): Promise<Record<string, string>>;
}

// Security Agent - Focuses on security vulnerabilities
export class SecurityAgent extends Agent {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'SecurityAgent',
        description: 'Identifies security vulnerabilities and compliance issues',
        capabilities: ['Security'],
        priority: 'high',
      },
      aiHandler
    );
  }

  async analyze(input: CapabilityInput): Promise<Record<string, string>> {
    const { prData, userQuery } = input;
    const diff = prData.diff.slice(0, 3000);

    const prompt = `You are a security expert. Analyze this code for security issues:

\`\`\`
${diff}
\`\`\`

Identify:
1. SQL injection vulnerabilities
2. XSS/injection attacks
3. Authentication/authorization issues
4. Cryptographic weaknesses
5. Data exposure risks
6. Third-party dependency vulnerabilities

Rate severity (Critical/High/Medium/Low) for each issue.

${userQuery ? `\nAdditional focus: ${userQuery}` : ''}`;

    const response = await this.aiHandler.complete(
      prompt,
      'You are a security expert. Identify vulnerabilities, security risks, and compliance issues.'
    );

    return {
      vulnerabilities: response,
    };
  }
}

// Performance Agent - Focuses on performance optimizations
export class PerformanceAgent extends Agent {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'PerformanceAgent',
        description: 'Analyzes performance and suggests optimizations',
        capabilities: ['Performance'],
        priority: 'medium',
      },
      aiHandler
    );
  }

  async analyze(input: CapabilityInput): Promise<Record<string, string>> {
    const { prData, userQuery } = input;
    const diff = prData.diff.slice(0, 3000);

    const prompt = `You are a performance optimization expert. Analyze this code for performance issues:

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

For each issue, suggest specific optimizations with estimated impact.

${userQuery ? `\nAdditional focus: ${userQuery}` : ''}`;

    const response = await this.aiHandler.complete(
      prompt,
      'You are a performance optimization expert. Identify bottlenecks and suggest improvements.'
    );

    return {
      optimizations: response,
    };
  }
}

// Refactor Agent - Focuses on code quality and maintainability
export class RefactorAgent extends Agent {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'RefactorAgent',
        description: 'Suggests code refactoring and architectural improvements',
        capabilities: ['CodeReview'],
        priority: 'medium',
      },
      aiHandler
    );
  }

  async analyze(input: CapabilityInput): Promise<Record<string, string>> {
    const { prData, userQuery } = input;
    const diff = prData.diff.slice(0, 3000);

    const prompt = `You are a code quality expert. Analyze this code for refactoring opportunities:

\`\`\`
${diff}
\`\`\`

Provide:
1. Code style and maintainability issues
2. Design pattern opportunities
3. Duplication and DRY principle violations
4. Error handling improvements
5. Type safety improvements
6. Testing opportunities

Suggest concrete refactoring steps.

${userQuery ? `\nAdditional focus: ${userQuery}` : ''}`;

    const response = await this.aiHandler.complete(
      prompt,
      'You are a code quality expert. Evaluate code for improvements and architectural patterns.'
    );

    return {
      refactoringSuggestions: response,
    };
  }
}

// Test Agent - Focuses on test coverage
export class TestAgent extends Agent {
  constructor(aiHandler: OpenAIHandler) {
    super(
      {
        name: 'TestAgent',
        description: 'Evaluates test coverage and suggests test cases',
        capabilities: ['Testability'],
        priority: 'low',
      },
      aiHandler
    );
  }

  async analyze(input: CapabilityInput): Promise<Record<string, string>> {
    const { prData, userQuery } = input;
    const diff = prData.diff.slice(0, 3000);

    const prompt = `You are a test engineering expert. Review test coverage for these changes:

\`\`\`
${diff}
\`\`\`

Provide:
1. What should be tested
2. Edge cases to cover
3. Suggested test cases (in pseudo-code)
4. Integration test scenarios
5. Areas that need more coverage
6. Mocking and fixtures needed

${userQuery ? `\nAdditional focus: ${userQuery}` : ''}`;

    const response = await this.aiHandler.complete(
      prompt,
      'You are a test engineering expert. Evaluate test coverage and suggest test cases.'
    );

    return {
      testCoverage: response,
    };
  }
}

// Agent Orchestrator - Manages parallel agent execution
export class AgentOrchestrator {
  private agents: Agent[] = [];

  constructor(aiHandler: OpenAIHandler) {
    this.agents = [
      new SecurityAgent(aiHandler),
      new PerformanceAgent(aiHandler),
      new RefactorAgent(aiHandler),
      new TestAgent(aiHandler),
    ];
  }

  async executeAll(input: CapabilityInput): Promise<AgentOrchestratorResult> {
    const startTime = Date.now();
    const results: AgentResult[] = [];
    const criticalIssues: string[] = [];

    // Execute all agents in parallel
    const agentPromises = this.agents.map(async (agent) => {
      try {
        const start = Date.now();
        const agentResults = await agent.analyze(input);
        const executionTime = Date.now() - start;

        // Extract critical issues from security agent
        if (
          agent.name === 'SecurityAgent' &&
          agentResults.vulnerabilities?.includes('Critical')
        ) {
          criticalIssues.push(
            `Critical security issue found by ${agent.name}`
          );
        }

        return {
          agent: agent.name,
          results: agentResults,
          executionTime,
          status: 'success' as const,
        };
      } catch (error) {
        return {
          agent: agent.name,
          results: {},
          executionTime: 0,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const agentResults = await Promise.all(agentPromises);
    results.push(...agentResults);

    const successCount = results.filter((r) => r.status === 'success').length;
    const failureCount = results.filter((r) => r.status === 'error').length;

    // Generate recommendations based on agent findings
    const recommendations = this.generateRecommendations(results);

    return {
      agents: results,
      summary: {
        totalTime: Date.now() - startTime,
        successCount,
        failureCount,
        criticalIssues,
        recommendations,
      },
    };
  }

  async executeByPriority(
    input: CapabilityInput,
    priority: 'high' | 'medium' | 'low' = 'high'
  ): Promise<AgentOrchestratorResult> {
    const filteredAgents = this.agents.filter((a) => a.priority === priority);

    if (filteredAgents.length === 0) {
      return {
        agents: [],
        summary: {
          totalTime: 0,
          successCount: 0,
          failureCount: 0,
          criticalIssues: [],
          recommendations: [],
        },
      };
    }

    const startTime = Date.now();
    const results: AgentResult[] = [];

    for (const agent of filteredAgents) {
      try {
        const start = Date.now();
        const agentResults = await agent.analyze(input);
        results.push({
          agent: agent.name,
          results: agentResults,
          executionTime: Date.now() - start,
          status: 'success',
        });
      } catch (error) {
        results.push({
          agent: agent.name,
          results: {},
          executionTime: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failureCount = results.filter((r) => r.status === 'error').length;
    const recommendations = this.generateRecommendations(results);

    return {
      agents: results,
      summary: {
        totalTime: Date.now() - startTime,
        successCount,
        failureCount,
        criticalIssues: [],
        recommendations,
      },
    };
  }

  private generateRecommendations(results: AgentResult[]): string[] {
    const recommendations: string[] = [];

    // If security agent failed, recommend fixing it first
    const securityResult = results.find((r) => r.agent === 'SecurityAgent');
    if (securityResult?.status === 'error') {
      recommendations.push('Fix security agent issues before deployment');
    } else if (securityResult?.status === 'success') {
      if (
        Object.values(securityResult.results).some((r) =>
          r.includes('Critical')
        )
      ) {
        recommendations.push('Address critical security issues immediately');
      }
    }

    // Performance recommendations
    const perfResult = results.find((r) => r.agent === 'PerformanceAgent');
    if (
      perfResult?.status === 'success' &&
      Object.values(perfResult.results).some((r) => r.length > 100)
    ) {
      recommendations.push(
        'Consider performance optimizations before merging'
      );
    }

    // Test coverage recommendations
    const testResult = results.find((r) => r.agent === 'TestAgent');
    if (
      testResult?.status === 'success' &&
      Object.values(testResult.results).some((r) =>
        r.includes('not covered')
      )
    ) {
      recommendations.push('Improve test coverage for changed code');
    }

    return recommendations;
  }

  listAgents(): { name: string; description: string; priority: string }[] {
    return this.agents.map((a) => ({
      name: a.name,
      description: a.description,
      priority: a.priority,
    }));
  }
}
