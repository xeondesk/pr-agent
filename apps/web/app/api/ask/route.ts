import { NextRequest } from 'next/server';
import { fetchGitHubPR, createMockPRData, createAIHandler, encodeSSE } from '../utils';
import { executeTool } from '../../../lib/tools';
import { AskRequestSchema } from '@/lib/validation';
import { parseRequestBody, formatErrorResponse, ERROR_CODES, logger } from '@/lib/errors';
import { rateLimitMiddleware, addRateLimitHeaders } from '@/lib/middleware/rateLimit';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const rateLimitResponse = rateLimitMiddleware(request);
    if (rateLimitResponse) return rateLimitResponse;

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return formatErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401, undefined, requestId);
    }

    const parseResult = await parseRequestBody(request, AskRequestSchema);
    if (!parseResult.success) return parseResult.error;

    const { pr_url, diff, user_query } = parseResult.data;

    let prData;
    try {
      if (pr_url) {
        const githubData = await fetchGitHubPR(pr_url);
        prData = {
          url: pr_url,
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
      } else {
        prData = createMockPRData(diff || '', 'local');
      }
    } catch {
      prData = createMockPRData(diff || '', pr_url || 'local-diff');
    }

    const aiHandler = createAIHandler();

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          const stream = executeTool('ask', {
            prData,
            context: user_query || '',
            userQuery: user_query || '',
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

    return addRateLimitHeaders(new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }), request, '/api/ask');
  } catch (error) {
    logger.error('Ask API error', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500,
      undefined,
      requestId
    );
  }
}
