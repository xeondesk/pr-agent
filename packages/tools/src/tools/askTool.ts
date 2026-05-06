import { BaseTool } from '../baseTool.js';
import type { ToolInput } from '@pr-agent/types';
import { Compression } from '@pr-agent/core';

export class AskTool extends BaseTool {
  constructor(aiHandler: any) {
    super('ask', 'Answer specific questions about the pull request', aiHandler);
  }

  generatePrompt(input: ToolInput): string {
    const { prData, userQuery } = input;
    const compressedDiff = Compression.compressDiff(prData.diff);

    if (!userQuery) {
      return `Unable to process ask request: no question provided`;
    }

    return `Answer the following question about this pull request:

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

Question: ${userQuery}

Please provide a clear, detailed answer based on the code changes shown in the diff.`;
  }
}
