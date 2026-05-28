import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { reviewRequestSchema, type ReviewRequest } from '@/lib/api/schemas';
import type { ApiRequest } from '@/lib/api/types';
import { createSSEHeaders, fetchGitHubPR, createAIHandler, encodeSSE } from '../utils';
import { executeTool } from '@/lib/tools';
import { ApiError } from '@/lib/api/errors';

async function handler(req: ApiRequest<ReviewRequest>) {
  const { prUrl, diff, userQuery } = req.body;

  let prData;
  if (prUrl) {
    try {
      const githubData = await fetchGitHubPR(prUrl);
      prData = {
        url: prUrl,
        title: githubData.title || 'PR',
        description: githubData.description || '',
        diff: githubData.diff || diff || '',
        files: githubData.files || [],
        author: githubData.author || 'unknown',
        baseBranch: githubData.baseBranch || 'main',
        headBranch: githubData.headBranch || 'feature',
        createdAt: githubData.createdAt || new Date().toISOString(),
        updatedAt: githubData.updatedAt || new Date().toISOString(),
      };
    } catch (error) {
      throw new ApiError(
        'PR_FETCH_FAILED',
        `Failed to fetch PR data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        502
      );
    }
  } else {
    throw new ApiError('INVALID_INPUT', 'PR URL is required', 400);
  }

  const aiHandler = createAIHandler();

  const responseStream = new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        const stream = executeTool('review', {
          prData,
          context: userQuery || '',
          userQuery: userQuery || '',
        }, aiHandler);

        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(encodeSSE(chunk)));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(
          new TextEncoder().encode(`data: Error: ${errorMsg}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new NextResponse(responseStream, {
    headers: createSSEHeaders(),
  });
}

export const POST = withAuth(reviewRequestSchema, handler, {
  rateLimit: { maxRequests: 30, windowMs: 60000 },
});
