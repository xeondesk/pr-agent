import { BaseTool } from '../baseTool.js';
import type { ToolInput } from '@pr-agent/types';
import { Compression } from '@pr-agent/core';

export class ImproveTool extends BaseTool {
  constructor(aiHandler: any) {
    super(
      'improve',
      'Suggest improvements and refactoring opportunities for the code in the pull request',
      aiHandler
    );
  }

  generatePrompt(input: ToolInput): string {
    const { prData, userQuery } = input;
    const compressedDiff = Compression.compressDiff(prData.diff);

    return `Analyze this pull request and suggest specific improvements:

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

${userQuery ? `Focus area: ${userQuery}` : ''}

Please provide specific, actionable improvement suggestions:
1. Code style and consistency improvements
2. Performance optimizations
3. Readability enhancements
4. DRY principle violations
5. Error handling improvements
6. Type safety enhancements
7. Testing suggestions

For each suggestion, provide:
- The specific issue
- Why it matters
- The recommended change
- Code example if applicable`;
  }
}
