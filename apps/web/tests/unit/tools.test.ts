import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '@/lib/tools';
import { OpenAIHandler } from '@/lib/aiHandler';
import type { PRData } from '@/lib/types';

function createMockPRData(): PRData {
  return {
    url: 'https://github.com/owner/repo/pull/1',
    title: 'Test PR',
    description: 'A test pull request',
    diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old code\n+new code',
    files: [
      { filename: 'file.ts', additions: 1, deletions: 1, changes: 2, status: 'modified' },
    ],
    author: 'testuser',
    baseBranch: 'main',
    headBranch: 'feature',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('executeTool', () => {
  it('throws for unknown tool name', async () => {
    const mockHandler = {} as OpenAIHandler;
    const input = { prData: createMockPRData(), context: '', userQuery: '' };

    await expect(async () => {
      for await (const _ of executeTool('invalid' as any, input, mockHandler)) {
        // should throw before yielding
      }
    }).rejects.toThrow('Unknown tool');
  });

  it('calls aiHandler.streamCompletion for known tools', async () => {
    const streamMock = vi.fn().mockImplementation(async function* () {
      yield 'review result';
    });

    const mockHandler = {
      streamCompletion: streamMock,
    } as unknown as OpenAIHandler;

    const input = { prData: createMockPRData(), context: '', userQuery: '' };
    const results: string[] = [];

    for await (const chunk of executeTool('review', input, mockHandler)) {
      results.push(chunk);
    }

    expect(results).toContain('review result');
    expect(streamMock).toHaveBeenCalledOnce();
  });

  it('passes correct context to streamCompletion', async () => {
    const streamMock = vi.fn().mockImplementation(async function* () {
      yield 'result';
    });

    const mockHandler = {
      streamCompletion: streamMock,
    } as unknown as OpenAIHandler;

    const input = { prData: createMockPRData(), context: 'custom context', userQuery: 'custom query' };

    for await (const _ of executeTool('ask', input, mockHandler)) {
      // consume stream
    }

    const promptArg = streamMock.mock.calls[0][0] as string;
    expect(promptArg).toContain('custom query');
  });
});
