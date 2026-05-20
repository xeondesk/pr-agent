import type { ConfigSettings, FilePatchInfo } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

export class PRLineQuestions {
  private gitProvider: any;
  private prUrl: string;
  private mainPrLanguage: string;
  private aiHandler: AIHandler;
  private questionStr: string;
  private vars: Record<string, unknown>;
  private tokenHandler: any;
  private patchesDiff: string | null;
  private prediction: string | null;
  private patchWithLines: string;
  private selectedLines: string;
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.questionStr = this.parseArgs(args);
    this.prUrl = prUrl;
    this.gitProvider = gitProvider;
    this.mainPrLanguage = gitProvider.getMainPrLanguage
      ? gitProvider.getMainPrLanguage(gitProvider.getLanguages(), gitProvider.getFiles())
      : 'Unknown';
    this.aiHandler = aiHandler;
    this.patchesDiff = null;
    this.prediction = null;
    this.patchWithLines = '';
    this.selectedLines = '';
    this.getSettings = getSettings;

    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      diff: '',
      question: this.questionStr,
      fullHunk: '',
      selectedLines: '',
      conversationHistory: '',
    };

    this.tokenHandler = null;
  }

  private parseArgs(args: string[] | undefined): string {
    if (args && args.length > 0) {
      return args.join(' ');
    }
    return '';
  }

  async run(): Promise<string> {
    console.log('Answering a PR lines question...');

    const s = this.getSettings();
    const useConversationHistory = s.pr_questions?.use_conversation_history ?? false;
    if (useConversationHistory && this.gitProvider.constructor?.name === 'GithubProvider') {
      const conversationHistory = this.loadConversationHistory();
      this.vars.conversationHistory = conversationHistory;
    }

    let patchWithLines = '';
    let selectedLines = '';
    const askDiff = (s as any).ask_diff_hunk || '';
    const lineStart = (s as any).line_start || '';
    const lineEnd = (s as any).line_end || '';
    const side = (s as any).side || 'RIGHT';
    const fileName = (s as any).file_name || '';
    const commentId = (s as any).comment_id || '';

    if (askDiff) {
      const result = this.extractHunkLinesFromPatch(askDiff, fileName, lineStart, lineEnd, side);
      patchWithLines = result.patch;
      selectedLines = result.lines;
    } else {
      const diffFiles = this.gitProvider.getDiffFiles();
      for (const file of diffFiles) {
        if (file.filename === fileName) {
          const result = this.extractHunkLinesFromPatch(file.patch, file.filename, lineStart, lineEnd, side);
          patchWithLines = result.patch;
          selectedLines = result.lines;
          break;
        }
      }
    }

    this.patchWithLines = patchWithLines;
    this.selectedLines = selectedLines;

    if (patchWithLines) {
      const modelAnswer = await this.getPrediction(s.config?.model || 'gpt-4');
      let answerSanitized = modelAnswer.trim().replace(/\n\//g, '\n /');
      if (answerSanitized.startsWith('/')) {
        answerSanitized = ' ' + answerSanitized;
      }

      console.log('Preparing answer...');
      if (commentId) {
        this.gitProvider.replyToCommentFromCommentId(commentId, answerSanitized);
      } else {
        this.gitProvider.publishComment(answerSanitized);
      }
    }

    return '';
  }

  private loadConversationHistory(): string {
    const s = this.getSettings();
    const commentId = (s as any).comment_id || '';
    const filePath = (s as any).file_name || '';
    const lineNumber = (s as any).line_end || '';

    if (!commentId || !filePath || !lineNumber) {
      console.error('Missing required parameters for conversation history');
      return '';
    }

    try {
      const threadComments = this.gitProvider.getReviewThreadComments(commentId);
      const filteredComments: { author: string; body: string }[] = [];

      for (const comment of threadComments) {
        const body = comment.body || '';
        if (!body.trim() || (comment.id === commentId)) {
          continue;
        }
        const author = comment.user?.login || 'Unknown';
        filteredComments.push({ author, body });
      }

      if (filteredComments.length > 0) {
        console.log(`Loaded ${filteredComments.length} comments from the code review thread`);
        return filteredComments
          .map((c, i) => `${i + 1}. ${c.author}: ${c.body}`)
          .join('\n');
      }

      return '';
    } catch (e: any) {
      console.error(`Error processing conversation history: ${e.message}`);
      return '';
    }
  }

  private async getPrediction(model: string): Promise<string> {
    const variables = { ...this.vars };
    variables.fullHunk = this.patchWithLines;
    variables.selectedLines = this.selectedLines;

    const systemPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_line_questions_prompt?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_line_questions_prompt?.user || '',
      variables
    );

    if ((this.getSettings().config?.verbosity_level ?? 0) >= 2) {
      console.log(`\nSystem prompt:\n${systemPrompt}`);
      console.log(`\nUser prompt:\n${userPrompt}`);
    }

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    return response.content;
  }

  private extractHunkLinesFromPatch(
    patch: string,
    fileName: string,
    lineStart: string,
    lineEnd: string,
    side: string
  ): { patch: string; lines: string } {
    if (!patch) return { patch: '', lines: '' };
    const lines = patch.split('\n');
    const selected: string[] = [];
    let inHunk = false;
    let currentLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inHunk = true;
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          currentLine = parseInt(match[1], 10);
        }
        selected.push(line);
      } else if (inHunk) {
        if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
          const lineNum = line.startsWith('+') || (side === 'RIGHT');
          if (lineNum) {
            if (currentLine >= parseInt(lineStart, 10) && currentLine <= parseInt(lineEnd, 10)) {
              selected.push(line);
            }
            if (!line.startsWith('-')) currentLine++;
            if (side !== 'RIGHT' && line.startsWith(' ')) {
              selected.push(line);
              currentLine++;
            }
          }
        } else {
          inHunk = false;
        }
      }
    }

    return {
      patch: selected.join('\n'),
      lines: `Lines ${lineStart}-${lineEnd} in ${fileName}`,
    };
  }

  renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = variables[trimmedKey];
      return value !== undefined ? String(value) : match;
    });
  }
}
