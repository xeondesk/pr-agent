import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { capabilitiesRequestSchema, type CapabilitiesRequest } from '@/lib/api/schemas';
import type { ApiRequest } from '@/lib/api/types';
import { createSSEHeaders, fetchGitHubPR, createAIHandler, encodeSSE } from '../utils';
import { createCapabilityRegistry } from '@/lib/capabilities';
import type { CapabilityInput } from '@/lib/capabilities';
import { ApiError } from '@/lib/api/errors';
import { withMiddleware } from '@/lib/api/middleware';
import { z } from 'zod/v4';

async function handler(req: ApiRequest<CapabilitiesRequest>) {
  const { prUrl, diff: _diff, capabilities, userQuery } = req.body;

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
  const registry = createCapabilityRegistry(aiHandler);
  const capabilityList = Array.isArray(capabilities) ? capabilities : [capabilities];

  const validCapabilities = capabilityList.filter((c: string) => registry.get(c));
  if (validCapabilities.length === 0) {
    throw new ApiError(
      'INVALID_CAPABILITIES',
      'No valid capabilities specified. Available: ' + registry.list().map((c) => c.name).join(', '),
      400
    );
  }

  const input: CapabilityInput = { prData, userQuery };

  const responseStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for (const capabilityName of validCapabilities) {
          try {
            const stream = registry.streamCapability(capabilityName, input);

            controller.enqueue(encoder.encode(encodeSSE(`[START] ${capabilityName}`)));

            for await (const chunk of stream) {
              controller.enqueue(encoder.encode(encodeSSE(chunk)));
            }

            controller.enqueue(encoder.encode(encodeSSE(`[END] ${capabilityName}`)));
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            controller.enqueue(encoder.encode(encodeSSE(`[ERROR] ${capabilityName}: ${errorMsg}`)));
          }
        }

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

export const POST = withAuth(capabilitiesRequestSchema, handler, {
  rateLimit: { maxRequests: 20, windowMs: 60000 },
});

const listSchema = z.object({});
export const GET = withMiddleware(listSchema, async () => {
  const { createAIHandler } = await import('../utils');
  const aiHandler = createAIHandler();
  const registry = createCapabilityRegistry(aiHandler);
  const capabilities = registry.list().map((c) => ({
    name: c.name,
    description: c.description,
  }));
  return NextResponse.json({ capabilities });
});
