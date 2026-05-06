import { TokenCounter } from './tokenCounter.js';

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

export abstract class AIHandler {
  protected apiKey: string;
  protected model: string;
  protected temperature: number;
  protected maxTokens: number;
  protected tokenCounter: TokenCounter;

  constructor(config: AIHandlerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2048;
    this.tokenCounter = new TokenCounter(config.model);
  }

  abstract complete(messages: AIMessage[]): Promise<AIResponse>;
  abstract stream(messages: AIMessage[]): Promise<AIStreamResponse>;
}

export class OpenAIHandler extends AIHandler {
  private baseUrl = 'https://api.openai.com/v1';

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

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { total_tokens: number };
    };
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
              const data = JSON.parse(line.slice(6)) as {
                choices: Array<{ delta: { content?: string } }>;
              };
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
