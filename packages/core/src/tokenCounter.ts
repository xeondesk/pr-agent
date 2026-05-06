import { encodingForModel } from 'js-tiktoken';

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

  estimateCost(tokens: number, model: string = 'gpt-4'): number {
    // Approximate costs per 1M tokens
    const costs: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    };
    const cost = costs[model] || costs['gpt-4'];
    return (tokens / 1000000) * cost.input;
  }
}
