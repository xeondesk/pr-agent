import { createSSEHeaders, fetchGitHubPR, createMockPRData, createAIHandler, encodeSSE } from '../utils';
import { createCapabilityRegistry } from '../../../lib/capabilities';
import type { CapabilityInput } from '../../../lib/capabilities';

export async function POST(request: Request) {
  try {
    const { prUrl, diff, capabilities, userQuery } = await request.json();

    if (!prUrl && !diff) {
      return new Response(
        JSON.stringify({ error: 'Either prUrl or diff is required' }),
        { status: 400 }
      );
    }

    // Fetch or create PR data
    let prData;
    if (prUrl) {
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
    } else {
      prData = createMockPRData(diff, 'local');
    }

    const aiHandler = createAIHandler();
    const registry = createCapabilityRegistry(aiHandler);
    const capabilityList = Array.isArray(capabilities) ? capabilities : [capabilities];

    // Validate capabilities
    const validCapabilities = capabilityList.filter((c) => registry.get(c));
    if (validCapabilities.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No valid capabilities specified',
          available: registry.list().map((c) => c.name),
        }),
        { status: 400 }
      );
    }

    // Stream results from multiple capabilities
    const input: CapabilityInput = {
      prData,
      userQuery,
    };

    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for (const capabilityName of validCapabilities) {
            try {
              const stream = registry.streamCapability(capabilityName, input);

              controller.enqueue(
                encoder.encode(
                  encodeSSE(`[START] ${capabilityName}`)
                )
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

    return new Response(responseStream, {
      status: 200,
      headers: createSSEHeaders(),
    });
  } catch (error) {
    console.error('Capabilities API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
}

export async function GET(_request: Request) {
  try {
    const aiHandler = createAIHandler();
    const registry = createCapabilityRegistry(aiHandler);

    const capabilities = registry.list().map((c) => ({
      name: c.name,
      description: c.description,
    }));

    return new Response(JSON.stringify({ capabilities }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
}
