import { BaseTool } from '../baseTool.js';
import type { ToolInput } from '@pr-agent/types';
import { Compression } from '@pr-agent/core';

export class DescribeTool extends BaseTool {
  constructor(aiHandler: any) {
    super(
      'describe',
      'Generate a summary and description of the changes in the pull request',
      aiHandler
    );
  }

  generatePrompt(input: ToolInput): string {
    const { prData } = input;
    const compressedDiff = Compression.compressDiff(prData.diff);

    return `Analyze this pull request and provide a clear, concise description:

Title: ${prData.title}
Current Description: ${prData.description || '(No description provided)'}
Author: ${prData.author}

Files Changed: ${prData.files.map((f) => f.filename).join(', ')}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

Please provide:
1. A concise summary of what changes were made (2-3 sentences)
2. The purpose/motivation for these changes
3. Key modifications by file
4. Impact assessment
5. Whether this is a breaking change

Format as a helpful PR description that could improve the original.`;
  }
}
