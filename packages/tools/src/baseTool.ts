import type { ToolInput, ToolResult } from '@pr-agent/types';
import type { AIHandler } from '@pr-agent/core';
import { AIMessage } from '@pr-agent/core';

export abstract class BaseTool {
  protected aiHandler: AIHandler;
  protected name: string;
  protected description: string;

  constructor(name: string, description: string, aiHandler: AIHandler) {
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

  abstract generatePrompt(input: ToolInput): string;

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
