import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { agentsRequestSchema, type AgentsRequest } from '@/lib/api/schemas';
import type { ApiRequest } from '@/lib/api/types';
import { createSSEHeaders, fetchGitHubPR, createAIHandler, encodeSSE } from '../utils';
import { AgentOrchestrator } from '@/lib/agents';
import type { CapabilityInput } from '@/lib/types';
import { ApiError } from '@/lib/api/errors';
import { withMiddleware } from '@/lib/api/middleware';
import { z } from 'zod/v4';

async function handler(req: ApiRequest<AgentsRequest>) {
  const { prUrl, diff, mode } = req.body;

  let prData;
  if (prUrl) {
    try {
      const partialData = await fetchGitHubPR(prUrl);
      prData = {
        url: prUrl,
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
  const orchestrator = new AgentOrchestrator(aiHandler);

  const input: CapabilityInput = { prData };

  const modeMap: Record<string, () => Promise<any>> = {
    all: () => orchestrator.executeAll(input),
    high: () => orchestrator.executeByPriority(input, 'high'),
    medium: () => orchestrator.executeByPriority(input, 'medium'),
    low: () => orchestrator.executeByPriority(input, 'low'),
  };

  const executor = modeMap[mode];
  if (!executor) {
    throw new ApiError('INVALID_MODE', `Invalid mode: ${mode}. Use: all, high, medium, low`, 400);
  }

  const result = await executor();

  const responseStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for (const agentResult of result.agents) {
          controller.enqueue(
            encoder.encode(encodeSSE(JSON.stringify({ type: 'agent_start', agent: agentResult.agent })))
          );

          for (const [key, value] of Object.entries(agentResult.results)) {
            controller.enqueue(
              encoder.encode(encodeSSE(JSON.stringify({
                type: 'agent_result',
                agent: agentResult.agent,
                category: key,
                content: value,
                executionTime: agentResult.executionTime,
              })))
            );
          }

          if (agentResult.status === 'error') {
            controller.enqueue(
              encoder.encode(encodeSSE(JSON.stringify({
                type: 'agent_error',
                agent: agentResult.agent,
                error: agentResult.error,
              })))
            );
          }
        }

        controller.enqueue(encoder.encode(encodeSSE(JSON.stringify({ type: 'summary', summary: result.summary }))));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(new TextEncoder().encode(`data: Error: ${errorMsg}\n\n`));
        controller.close();
      }
    },
  });

  return new NextResponse(responseStream, {
    status: 200,
    headers: createSSEHeaders(),
  });
}

export const POST = withAuth(agentsRequestSchema, handler, {
  rateLimit: { maxRequests: 20, windowMs: 60000 },
});

const listSchema = z.object({});
export const GET = withMiddleware(listSchema, async () => {
  const { createAIHandler } = await import('../utils');
  const aiHandler = createAIHandler();
  const orchestrator = new AgentOrchestrator(aiHandler);
  const agents = orchestrator.listAgents();
  return NextResponse.json({ agents });
});
