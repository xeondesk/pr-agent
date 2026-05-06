import type { PRData, PullFile } from '../../lib/prAgent';
import { OpenAIHandler, ReviewAgent } from '../../lib/prAgent';

export function createSSEHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
}

export async function fetchGitHubPR(url: string): Promise<Partial<PRData>> {
  // Parse GitHub PR URL
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error('Invalid GitHub PR URL');
  }

  const [, owner, repo, prNumber] = match;

  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const pr = (await response.json()) as any;

    // Fetch files to get diff info
    const filesUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
    const filesResponse = await fetch(filesUrl);
    const files = (await filesResponse.json()) as any[];

    const prFiles: PullFile[] = files.map((file) => ({
      filename: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      status: file.status,
      patch: file.patch,
    }));

    return {
      url,
      title: pr.title,
      description: pr.body || '',
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      files: prFiles,
      diff: files.map((f) => f.patch || '').join('\n'),
    };
  } catch (error) {
    console.error('Failed to fetch GitHub PR:', error);
    throw error;
  }
}

export function createMockPRData(diff: string, url: string): PRData {
  return {
    url,
    title: 'Pull Request',
    description: 'Pull request analysis',
    diff,
    files: [],
    author: 'unknown',
    baseBranch: 'main',
    headBranch: 'feature',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createReviewAgent(): ReviewAgent {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const aiHandler = new OpenAIHandler({
    apiKey,
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2048,
  });

  return new ReviewAgent(aiHandler);
}

export function encodeSSE(data: string): string {
  return `data: ${data}\n\n`;
}
