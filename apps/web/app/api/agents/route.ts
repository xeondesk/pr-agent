import { createSSEHeaders, fetchGitHubPR, createMockPRData, createAIHandler, encodeSSE } from '../utils';
import { AgentOrchestrator } from '../../../lib/agents';
import type { CapabilityInput } from '../../../lib/types';

export async function POST(request: Request) {
  try {
    const { prUrl, diff, mode = 'all' } = await request.json();

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
    const orchestrator = new AgentOrchestrator(aiHandler);

    const input: CapabilityInput = {
      prData,
    };

    // Execute agents based on mode
    let result;
    if (mode === 'all') {
      result = await orchestrator.executeAll(input);
    } else if (mode === 'high') {
      result = await orchestrator.executeByPriority(input, 'high');
    } else if (mode === 'medium') {
      result = await orchestrator.executeByPriority(input, 'medium');
    } else if (mode === 'low') {
      result = await orchestrator.executeByPriority(input, 'low');
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid mode. Use: all, high, medium, low' }),
        { status: 400 }
      );
    }

    // Stream results
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Stream each agent's results
          for (const agentResult of result.agents) {
            controller.enqueue(
              encoder.encode(
                encodeSSE(
                  JSON.stringify({
                    type: 'agent_start',
                    agent: agentResult.agent,
                  })
                )
              )
            );

            for (const [key, value] of Object.entries(
              agentResult.results
            )) {
              controller.enqueue(
                encoder.encode(
                  encodeSSE(
                    JSON.stringify({
                      type: 'agent_result',
                      agent: agentResult.agent,
                      category: key,
                      content: value,
                      executionTime: agentResult.executionTime,
                    })
                  )
                )
              );
            }

            if (agentResult.status === 'error') {
              controller.enqueue(
                encoder.encode(
                  encodeSSE(
                    JSON.stringify({
                      type: 'agent_error',
                      agent: agentResult.agent,
                      error: agentResult.error,
                    })
                  )
                )
              );
            }
          }

          // Stream summary
          controller.enqueue(
            encoder.encode(
              encodeSSE(
                JSON.stringify({
                  type: 'summary',
                  summary: result.summary,
                })
              )
            )
          );

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
    console.error('Agents API error:', error);
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
    const orchestrator = new AgentOrchestrator(aiHandler);

    const agents = orchestrator.listAgents();

    return new Response(JSON.stringify({ agents }), {
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
