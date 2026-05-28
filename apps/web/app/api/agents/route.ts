import { NextRequest } from 'next/server';
import { fetchGitHubPR, createMockPRData, createAIHandler, encodeSSE } from '../utils';
import { AgentOrchestrator } from '../../../lib/agents';
import type { CapabilityInput } from '../../../lib/types';
import { AgentsRequestSchema } from '@/lib/validation';
import { parseRequestBody, formatErrorResponse, ERROR_CODES, createErrors, logger } from '@/lib/errors';
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

    const parseResult = await parseRequestBody(request, AgentsRequestSchema);
    if (!parseResult.success) return parseResult.error;

    const { pr_url, diff, mode } = parseResult.data;

    let prData;
    if (pr_url) {
      try {
        const partialData = await fetchGitHubPR(pr_url);
        prData = {
          url: pr_url,
          title: partialData.title || 'Pull Request',
          description: partialData.description || '',
          diff: partialData.diff || '',
          files: partialData.files || [],
          author: partialData.author || 'unknown',
          baseBranch: partialData.baseBranch || 'main',
          headBranch: partialData.headBranch || 'feature',
          createdAt: partialData.createdAt || new Date().toISOString(),
          updatedAt: partialData.updatedAt || new Date().toISOString(),
        };
      } catch (err) {
        logger.error('Failed to fetch GitHub PR', err);
        throw createErrors.githubApiError({ pr_url });
      }
    } else {
      prData = createMockPRData(diff || '', 'local');
    }

    const aiHandler = createAIHandler();
    const orchestrator = new AgentOrchestrator(aiHandler);

    const input: CapabilityInput = { prData };

    let result;
    if (mode === 'all') {
      result = await orchestrator.executeAll(input);
    } else if (mode === 'high') {
      result = await orchestrator.executeByPriority(input, 'high');
    } else if (mode === 'medium') {
      result = await orchestrator.executeByPriority(input, 'medium');
    } else {
      result = await orchestrator.executeByPriority(input, 'low');
    }

    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for (const agentResult of result.agents) {
            controller.enqueue(
              encoder.encode(encodeSSE(JSON.stringify({ type: 'agent_start', agent: agentResult.agent }))
            ));
            for (const [key, value] of Object.entries(agentResult.results)) {
              controller.enqueue(
                encoder.encode(encodeSSE(JSON.stringify({
                  type: 'agent_result', agent: agentResult.agent,
                  category: key, content: value, executionTime: agentResult.executionTime,
                })))
              );
            }
            if (agentResult.status === 'error') {
              controller.enqueue(
                encoder.encode(encodeSSE(JSON.stringify({ type: 'agent_error', agent: agentResult.agent, error: agentResult.error })))
              );
            }
          }
          controller.enqueue(encoder.encode(encodeSSE(JSON.stringify({ type: 'summary', summary: result.summary }))));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: Error: ${errorMsg}\n\n`));
          controller.close();
        }
      },
    });

    return addRateLimitHeaders(new Response(responseStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }), request, '/api/agents');
  } catch (error) {
    logger.error('Agents API error', error);
    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      return formatErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'AI service not configured', 503, undefined, requestId);
    }
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500,
      undefined,
      requestId
    );
  }
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const rateLimitResponse = rateLimitMiddleware(request);
    if (rateLimitResponse) return rateLimitResponse;

    const aiHandler = createAIHandler();
    const orchestrator = new AgentOrchestrator(aiHandler);
    const agents = orchestrator.listAgents();

    return addRateLimitHeaders(
      new Response(JSON.stringify({ agents }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      request,
      '/api/agents'
    );
  } catch (error) {
    logger.error('Agents GET error', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500,
      undefined,
      requestId
    );
  }
}
