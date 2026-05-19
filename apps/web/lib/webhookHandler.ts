import type { GitHubWebhookPayload, WebhookEvent } from './webhooks';

export interface WebhookHandlerConfig {
  autoReview: boolean;
  autoDescribe: boolean;
  autoImprove: boolean;
  postComments: boolean;
}

export class WebhookHandler {
  private config: WebhookHandlerConfig;

  constructor(config: WebhookHandlerConfig) {
    this.config = config;
  }

  async handlePROpened(payload: GitHubWebhookPayload): Promise<WebhookEvent> {
    const pr = payload.pull_request;
    const repo = payload.repository;

    if (!pr || !repo) {
      throw new Error('Invalid PR payload');
    }

    const tools: string[] = [];
    if (this.config.autoReview) tools.push('review');
    if (this.config.autoDescribe) tools.push('describe');
    if (this.config.autoImprove) tools.push('improve');

    const event: WebhookEvent = {
      id: `${repo.full_name}#${pr.number}-${Date.now()}`,
      webhookConfigId: '',
      prNumber: pr.number,
      action: 'opened',
      status: 'pending',
      tools,
      createdAt: new Date(),
    };

    return event;
  }

  async handlePRSynchronized(payload: GitHubWebhookPayload): Promise<WebhookEvent> {
    const pr = payload.pull_request;
    const repo = payload.repository;

    if (!pr || !repo) {
      throw new Error('Invalid PR payload');
    }

    const tools: string[] = [];
    if (this.config.autoReview) tools.push('review');
    if (this.config.autoDescribe) tools.push('describe');

    const event: WebhookEvent = {
      id: `${repo.full_name}#${pr.number}-${Date.now()}`,
      webhookConfigId: '',
      prNumber: pr.number,
      action: 'synchronize',
      status: 'pending',
      tools,
      createdAt: new Date(),
    };

    return event;
  }

  async executeTools(
    prUrl: string,
    tools: string[],
    onProgress: (tool: string, result: string) => void
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    for (const tool of tools) {
      try {
        const result = await this.callTool(tool, prUrl);
        results[tool] = result;
        onProgress(tool, result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results[tool] = `Error: ${errorMsg}`;
      }
    }

    return results;
  }

  private async callTool(tool: string, prUrl: string): Promise<string> {
    const response = await fetch(`/api/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prUrl }),
    });

    if (!response.ok) {
      throw new Error(`Tool ${tool} failed: ${response.statusText}`);
    }

    // Collect streamed response
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let result = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data && data !== '[DONE]') {
            result += data;
          }
        }
      }
    }

    return result;
  }

  async postCommentToPR(
    ghToken: string,
    repoOwner: string,
    repoName: string,
    prNumber: number,
    comment: string
  ): Promise<void> {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${prNumber}/comments`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: comment }),
    });

    if (!response.ok) {
      throw new Error(`Failed to post comment: ${response.statusText}`);
    }
  }

  formatResultsAsComment(results: Record<string, string>): string {
    let comment = '## PR Analysis Results\n\n';

    for (const [tool, result] of Object.entries(results)) {
      comment += `### ${tool.charAt(0).toUpperCase() + tool.slice(1)}\n`;
      comment += `${result.slice(0, 500)}${result.length > 500 ? '...' : ''}\n\n`;
    }

    comment += '---\n*Analyzed by PR-Agent*';

    return comment;
  }
}
