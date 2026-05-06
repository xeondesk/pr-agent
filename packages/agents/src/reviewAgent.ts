import { BaseAgent } from './baseAgent.js';
import type { PRData, AgentInput, AgentOutput } from '@pr-agent/types';
import { ToolRegistry } from '@pr-agent/tools';
import { ReviewTool, DescribeTool, ImproveTool, AskTool } from '@pr-agent/tools';
import type { AIHandler } from '@pr-agent/core';

export class ReviewAgent extends BaseAgent {
  private aiHandler: AIHandler;

  constructor(toolRegistry: ToolRegistry, aiHandler: AIHandler) {
    super('ReviewAgent', toolRegistry);
    this.aiHandler = aiHandler;
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
      const tool = this.getTool(input.toolName);

      if (!tool) {
        return {
          success: false,
          message: this.createMessage(
            `Tool "${input.toolName}" not found. Available tools: ${this.toolRegistry
              .listTools()
              .map((t) => t.name)
              .join(', ')}`
          ),
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
          message: this.createMessage(`Error executing ${input.toolName}: ${result.error}`),
          error: result.error,
        };
      }

      return {
        success: true,
        message: this.createMessage(result.output, 'assistant', input.toolName),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: this.createMessage(`Error: ${errorMsg}`),
        error: errorMsg,
      };
    }
  }

  async executeStream(input: AgentInput): Promise<AsyncGenerator<string, void, unknown>> {
    const self = this;
    return (async function* () {
      try {
        const tool = self.getTool(input.toolName);

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
