import { createSSEHeaders, fetchGitHubPR, createMockPRData, createReviewAgent, encodeSSE } from '../utils';

export async function POST(request: Request) {
  try {
    const { prUrl, diff, userQuery } = await request.json() as {
      prUrl?: string;
      diff?: string;
      userQuery?: string;
    };

    if (!prUrl && !diff) {
      return new Response('PR URL or diff required', { status: 400 });
    }

    let prData;
    try {
      if (prUrl?.includes('github.com')) {
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
      } else {
        prData = createMockPRData(diff || '', prUrl || 'local-diff');
      }
    } catch (error) {
      prData = createMockPRData(diff || '', prUrl || 'local-diff');
    }

    const agent = createReviewAgent();

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          const stream = await agent.executeStream({
            prData,
            toolName: 'improve',
            userQuery,
          });
          
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

    return new Response(responseStream, {
      headers: createSSEHeaders(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`Error: ${errorMsg}`, { status: 500 });
  }
}
