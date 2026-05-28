import { NextRequest } from 'next/server';
import { fetchGitHubPR, createMockPRData, createAIHandler, encodeSSE } from '../utils';
import { createCapabilityRegistry } from '../../../lib/capabilities';
import type { CapabilityInput } from '../../../lib/capabilities';
import { CapabilitiesRequestSchema } from '@/lib/validation';
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

    const parseResult = await parseRequestBody(request, CapabilitiesRequestSchema);
    if (!parseResult.success) return parseResult.error;

    const { pr_url, diff, capabilities_list, user_query } = parseResult.data;

    let prData;
    if (pr_url) {
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
    } else {
      prData = createMockPRData(diff, 'local');
    }

    const aiHandler = createAIHandler();
    const registry = createCapabilityRegistry(aiHandler);
    const capabilityList = Array.isArray(capabilities_list) ? capabilities_list : [capabilities_list];

    const validCapabilities = capabilityList.filter((c: string) => registry.get(c));
    if (validCapabilities.length === 0) {
      return formatErrorResponse(
        'NO_VALID_CAPABILITIES',
        'No valid capabilities specified',
        400,
        { available: registry.list().map((c: any) => c.name) },
        requestId
      );
    }

    const input: CapabilityInput = {
      prData,
      userQuery: user_query,
    };

    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for (const capabilityName of validCapabilities) {
            try {
              const stream = registry.streamCapability(capabilityName, input);

              controller.enqueue(
                encoder.encode(encodeSSE(`[START] ${capabilityName}`))
              );

              for await (const chunk of stream) {
                controller.enqueue(encoder.encode(encodeSSE(chunk)));
              }

              controller.enqueue(
                encoder.encode(encodeSSE(`[END] ${capabilityName}`))
              );
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              controller.enqueue(
                encoder.encode(encodeSSE(`[ERROR] ${capabilityName}: ${errorMsg}`))
              );
            }
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
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }), request, '/api/capabilities');
  } catch (error) {
    logger.error('Capabilities API error:', error);
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500,
      undefined,
      requestId
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    const aiHandler = createAIHandler();
    const registry = createCapabilityRegistry(aiHandler);

    const capabilities = registry.list().map((c: any) => ({
      name: c.name,
      description: c.description,
    }));

    return new Response(JSON.stringify({ capabilities }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return formatErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}
