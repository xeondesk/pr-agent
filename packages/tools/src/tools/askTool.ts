import { BaseTool } from '../baseTool.js';
import type { ToolInput, ToolResult, ConfigSettings, ModelType } from '@pr-agent/types';
import { ModelType as ModelTypeEnum } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

export class AskTool {
  private gitProvider: any;
  private prUrl: string;
  private mainPrLanguage: string;
  private aiHandler: AIHandler;
  private questionStr: string;
  private vars: Record<string, unknown>;
  private tokenHandler: any;
  private patchesDiff: string | null;
  private prediction: string | null;
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
    this.getSettings = getSettings;

    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      description: gitProvider.getPrDescription(),
      language: this.mainPrLanguage,
      diff: '',
      questions: this.questionStr,
      commitMessagesStr: gitProvider.getCommitMessages(),
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
    console.log(`Answering a PR question about the PR ${this.prUrl} `);

    if (this.getSettings().config?.publish_output) {
      this.gitProvider.publishComment('Preparing answer...', { isTemporary: true });
    }

    const imgPath = this.identifyImageInComment();
    if (imgPath) {
      console.log('Image path identified', imgPath);
    }

    await this.preparePrediction(imgPath);

    let prComment = this.preparePrAnswer();

    if (this.gitProvider.isSupported('gfmMarkdown') && this.getSettings().pr_questions?.enable_help_text) {
      prComment +=
        '<hr>\n\n<details> <summary><strong>\u{1F4A1} Tool usage guide:</strong></summary><hr> \n\n';
      prComment += this.getAskUsageGuide();
      prComment += '\n</details>\n';
    }

    if (this.getSettings().config?.publish_output) {
      this.gitProvider.publishComment(prComment);
      this.gitProvider.removeInitialComment();
    }
    return '';
  }

  private identifyImageInComment(): string {
    let imgPath = '';
    if (this.questionStr.includes('![image]')) {
      const parts = this.questionStr.split('![image]');
      if (parts.length > 1) {
        imgPath = parts[1].trim().replace(/^\(/, '').replace(/\)$/, '');
        this.vars['imgPath'] = imgPath;
      }
    } else if (
      this.questionStr.includes('https://') &&
      (this.questionStr.includes('.png') || this.questionStr.includes('.jpg'))
    ) {
      const match = this.questionStr.match(/https:\/\/[^\s]+/);
      if (match) {
        imgPath = match[0];
        this.vars['imgPath'] = imgPath;
      }
    }
    return imgPath;
  }

  private async preparePrediction(imgPath: string): Promise<void> {
    const model = this.getSettings().config?.model || 'gpt-4';
    this.patchesDiff = this.getPrDiff(model);
    if (this.patchesDiff) {
      console.log('PR diff', this.patchesDiff);
      this.prediction = await this.getPrediction(model, imgPath);
    } else {
      console.error('Error getting PR diff');
      this.prediction = '';
    }
  }

  private async getPrediction(model: string, imgPath: string): Promise<string> {
    const variables = { ...this.vars };
    variables.diff = this.patchesDiff;

    const systemPrompt = this.renderTemplate(
      this.getSettings().pr_questions_prompt?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      this.getSettings().pr_questions_prompt?.user || '',
      variables
    );

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    return response.content;
  }

  private gitlabProtections(modelAnswer: string): string {
    const githubQuickActions = [
      '/approve', '/close', '/merge', '/reopen', '/unapprove',
      '/title', '/assign', '/copy_metadata', '/target_branch',
    ];
    if (githubQuickActions.some((action) => modelAnswer.includes(action))) {
      const err = 'Model answer contains GitHub quick actions, which are not supported in GitLab';
      console.error(err);
      return err;
    }
    return modelAnswer;
  }

  private preparePrAnswer(): string {
    let modelAnswer = (this.prediction || '').trim();
    let sanitized = modelAnswer.replace(/\n\//g, '\n /').replace(/\r\//g, '\r /');

    if (this.gitProvider.constructor?.name === 'GitLabProvider') {
      sanitized = this.gitlabProtections(sanitized);
    }
    if (sanitized.startsWith('/')) {
      sanitized = ' ' + sanitized;
    }

    const answerStr = `### **Ask**\u2753\n${this.questionStr}\n\n### **Answer:**\n${sanitized}\n\n`;
    return answerStr;
  }

  getPrDiff(model: string): string | null {
    if (this.gitProvider.getPrDiff) {
      return this.gitProvider.getPrDiff(this.gitProvider, null, model);
    }
    return null;
  }

  renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = variables[trimmedKey];
      return value !== undefined ? String(value) : match;
    });
  }

  getAskUsageGuide(): string {
    return 'Use `/ask "<question>"` to ask a question about the PR.';
  }
}
