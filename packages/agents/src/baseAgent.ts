import type { PRData, Message, AgentInput, AgentOutput } from '@pr-agent/types';
import { ToolRegistry } from '@pr-agent/tools';
import { BaseTool } from '@pr-agent/tools';

export abstract class BaseAgent {
  protected toolRegistry: ToolRegistry;
  protected name: string;
  protected id: string = Math.random().toString(36).slice(2);

  constructor(name: string, toolRegistry: ToolRegistry) {
    this.name = name;
    this.toolRegistry = toolRegistry;
  }

  getName(): string {
    return this.name;
  }

  getId(): string {
    return this.id;
  }

  abstract execute(input: AgentInput): Promise<AgentOutput>;
  abstract executeStream(input: AgentInput): Promise<AsyncGenerator<string, void, unknown>>;

  protected createMessage(content: string, role: 'user' | 'assistant' = 'assistant', toolUsed?: string): Message {
    return {
      id: Math.random().toString(36).slice(2),
      role,
      content,
      timestamp: Date.now(),
      toolUsed,
    };
  }

  protected getTool(toolName: string): BaseTool | undefined {
    return this.toolRegistry.get(toolName);
  }
}
