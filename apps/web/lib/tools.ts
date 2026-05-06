import { OpenAIHandler } from './aiHandler';
import type { PRData, ToolInput } from './types';

function generateReviewPrompt(prData: PRData, userQuery: string): string {
  return `You are an expert code reviewer. Analyze this pull request and provide comprehensive feedback.

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}
Base Branch: ${prData.baseBranch}
Head Branch: ${prData.headBranch}

Files Changed: ${prData.files.length}
${prData.files.map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')}

Pull Request Diff (truncated):
\`\`\`
${prData.diff.slice(0, 2000)}${prData.diff.length > 2000 ? '\n... (diff truncated)' : ''}
\`\`\`

User Query: ${userQuery || 'Provide a general code review'}

Please provide:
1. Overall quality assessment
2. Potential bugs or issues
3. Code style and best practices
4. Performance considerations
5. Recommendations for improvement`;
}

function generateDescribePrompt(prData: PRData, userQuery: string): string {
  return `Summarize this pull request's changes in a clear, concise way.

Title: ${prData.title}
Description: ${prData.description}

Files Changed: ${prData.files.length}
${prData.files.map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')}

Provide a brief summary of what was changed and why.`;
}

function generateImprovePrompt(prData: PRData, userQuery: string): string {
  return `Suggest improvements to this pull request's code.

Title: ${prData.title}

Diff:
\`\`\`
${prData.diff.slice(0, 2000)}
\`\`\`

Suggest specific improvements for:
1. Code readability
2. Performance optimization
3. Error handling
4. Testing coverage
5. Documentation`;
}

function generateAskPrompt(prData: PRData, userQuery: string): string {
  return `Answer this question about the pull request:

Title: ${prData.title}
Question: ${userQuery}

Diff:
\`\`\`
${prData.diff.slice(0, 2000)}
\`\`\`

Provide a detailed answer to the question above.`;
}

type ToolName = 'review' | 'describe' | 'improve' | 'ask';

const promptGenerators: Record<ToolName, (prData: PRData, userQuery: string) => string> = {
  review: generateReviewPrompt,
  describe: generateDescribePrompt,
  improve: generateImprovePrompt,
  ask: generateAskPrompt,
};

export function executeTool(
  toolName: ToolName,
  input: ToolInput,
  aiHandler: OpenAIHandler
): AsyncGenerator<string> {
  const generator = (async function* () {
    const promptGenerator = promptGenerators[toolName];
    if (!promptGenerator) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const prompt = promptGenerator(input.prData, input.userQuery);
    yield* aiHandler.streamCompletion(prompt);
  })();

  return generator;
}
