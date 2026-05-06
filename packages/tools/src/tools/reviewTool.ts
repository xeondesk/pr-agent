import { BaseTool } from '../baseTool.js';
import type { ToolInput } from '@pr-agent/types';
import { Compression, PatchParser } from '@pr-agent/core';

export class ReviewTool extends BaseTool {
  constructor(aiHandler: any) {
    super(
      'review',
      'Analyze and review the pull request, providing feedback on code quality, best practices, and potential issues',
      aiHandler
    );
  }

  generatePrompt(input: ToolInput): string {
    const { prData, userQuery } = input;
    const patchParser = new PatchParser();
    const summary = patchParser.getSummary(prData.diff);
    const compressedDiff = Compression.compressDiff(prData.diff);

    return `Please review the following pull request:

Title: ${prData.title}
Description: ${prData.description}
Author: ${prData.author}
Base Branch: ${prData.baseBranch} → Head Branch: ${prData.headBranch}

Change Summary:
- Files changed: ${summary.files}
- Lines added: ${summary.additions}
- Lines deleted: ${summary.deletions}

Diff:
\`\`\`
${Compression.truncateDiff(compressedDiff, 300)}
\`\`\`

${userQuery ? `Additional context: ${userQuery}` : ''}

Please provide:
1. Overall assessment of the changes
2. Code quality observations
3. Potential bugs or security issues
4. Best practices feedback
5. Suggestions for improvement
6. Approval recommendation`;
  }
}
