import type { ConfigSettings } from '@pr-agent/types';
import { AIHandler } from '@pr-agent/core';

import { ReviewTool } from './tools/reviewTool.js';
import { DescribeTool } from './tools/describeTool.js';
import { ImproveTool } from './tools/improveTool.js';
import { AskTool } from './tools/askTool.js';
import { PRLineQuestions } from './tools/lineQuestionsTool.js';
import { PRAddDocs } from './tools/addDocsTool.js';
import { PRGenerateLabels } from './tools/generateLabelsTool.js';
import { PRUpdateChangelog } from './tools/updateChangelogTool.js';
import { PRConfig } from './tools/configTool.js';
import { PRHelpMessage } from './tools/helpMessageTool.js';
import { PRHelpDocs } from './tools/helpDocsTool.js';
import { PRSimilarIssue } from './tools/similarIssueTool.js';

type ToolConstructor = new (...args: any[]) => any;

export const command2class: Record<string, ToolConstructor> = {
  auto_review: ReviewTool,
  answer: ReviewTool,
  review: ReviewTool,
  review_pr: ReviewTool,
  describe: DescribeTool,
  describe_pr: DescribeTool,
  improve: ImproveTool,
  improve_code: ImproveTool,
  ask: AskTool,
  ask_question: AskTool,
  ask_line: PRLineQuestions,
  update_changelog: PRUpdateChangelog,
  config: PRConfig,
  settings: PRConfig,
  help: PRHelpMessage,
  similar_issue: PRSimilarIssue,
  add_docs: PRAddDocs,
  generate_labels: PRGenerateLabels,
  help_docs: PRHelpDocs,
};

export const commands = Object.keys(command2class);

export class PRAgent {
  private aiHandler: AIHandler;
  private getSettings: () => ConfigSettings;
  private gitProvider: any;

  constructor(
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.aiHandler = aiHandler;
    this.getSettings = getSettings;
    this.gitProvider = gitProvider;
  }

  async handleRequest(prUrl: string, request: string | string[], notify?: () => void): Promise<boolean> {
    try {
      return await this.handleRequestInternal(prUrl, request, notify);
    } catch (e: any) {
      console.error('Failed to process the command.', e);
      return false;
    }
  }

  private async handleRequestInternal(
    prUrl: string,
    request: string | string[],
    notify?: () => void
  ): Promise<boolean> {
    this.applyRepoSettings(prUrl);

    let action: string;
    let args: string[];

    if (typeof request === 'string') {
      const sanitized = request.replace(/'/g, "\\'");
      const parts = sanitized.split(/\s+/);
      action = parts[0];
      args = parts.slice(1);
    } else {
      action = request[0];
      args = request.slice(1);
    }

    const isValid = this.validateCliArgs(args);
    if (!isValid) {
      console.error(`CLI argument validation failed. Use instead a configuration file.`);
      return false;
    }

    args = this.updateSettingsFromArgs(args);

    const responseLanguage = this.getSettings().config?.response_language || 'en-us';
    if (responseLanguage.toLowerCase() !== 'en-us') {
      console.log(`User has set the response language to: ${responseLanguage}`);
      this.applyResponseLanguage(responseLanguage);
    }

    action = action.replace(/^\/+/, '').toLowerCase();

    if (!(action in command2class)) {
      console.warn(`Unknown command: ${action}`);
      return false;
    }

    console.log(`PR-Agent request handler started for command: ${action}, pr_url: ${prUrl}`);

    if (action === 'answer') {
      if (notify) notify();
      const tool = new ReviewTool(prUrl, true, false, args, this.aiHandler, this.getSettings, this.gitProvider);
      await tool.run();
      return true;
    }

    if (action === 'auto_review') {
      const tool = new ReviewTool(prUrl, false, true, args, this.aiHandler, this.getSettings, this.gitProvider);
      await tool.run();
      return true;
    }

    if (notify) notify();

    const ToolClass = command2class[action];

    switch (action) {
      case 'review':
      case 'review_pr': {
        const tool = new ReviewTool(prUrl, false, false, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'describe':
      case 'describe_pr': {
        const tool = new DescribeTool(prUrl, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'improve':
      case 'improve_code': {
        const tool = new ImproveTool(prUrl, false, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'ask':
      case 'ask_question': {
        const tool = new AskTool(prUrl, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'ask_line': {
        const tool = new PRLineQuestions(prUrl, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'update_changelog': {
        const tool = new PRUpdateChangelog(prUrl, false, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'config':
      case 'settings': {
        const tool = new PRConfig(prUrl, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'help': {
        const tool = new PRHelpMessage(prUrl, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'similar_issue': {
        const tool = new PRSimilarIssue(prUrl, this.aiHandler, this.getSettings, this.gitProvider, args);
        await tool.run();
        break;
      }
      case 'add_docs': {
        const tool = new PRAddDocs(prUrl, false, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'generate_labels': {
        const tool = new PRGenerateLabels(prUrl, args, this.aiHandler, this.getSettings, this.gitProvider);
        await tool.run();
        break;
      }
      case 'help_docs': {
        const tool = new PRHelpDocs(prUrl, this.aiHandler, this.getSettings, this.gitProvider, args);
        await tool.run();
        break;
      }
      default:
        return false;
    }

    return true;
  }

  private applyRepoSettings(_prUrl: string): void {
    try {
      const applyFn = (this.gitProvider as any).applyRepoSettings;
      if (applyFn) {
        applyFn(_prUrl);
      }
    } catch {
      // repo settings not available
    }
  }

  private validateCliArgs(args: string[]): boolean {
    for (const arg of args) {
      if (arg.startsWith('--') && arg.includes('=')) {
        const key = arg.split('=')[0].replace(/^--/, '');
        const forbiddenKeys = ['key', 'secret', 'token', 'password', 'private_key'];
        if (forbiddenKeys.some((k) => key.toLowerCase().includes(k))) {
          console.error(`CLI argument for param '${key}' is forbidden.`);
          return false;
        }
      }
    }
    return true;
  }

  private updateSettingsFromArgs(args: string[]): string[] {
    const updatedArgs: string[] = [];
    for (const arg of args) {
      if (arg.startsWith('--') && arg.includes('=')) {
        const [key, value] = arg.split('=');
        const settingPath = key.replace(/^--/, '');
        try {
          const parts = settingPath.split('.');
          if (parts.length >= 2) {
            const section = parts[0];
            const setting = parts.slice(1).join('.');
            const settings = this.getSettings() as any;
            if (settings[section]) {
              settings[section][setting] = this.parseValue(value);
            }
          }
        } catch {
          console.warn(`Failed to apply setting: ${settingPath}=${value}`);
        }
      } else {
        updatedArgs.push(arg);
      }
    }
    return updatedArgs;
  }

  private parseValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  private applyResponseLanguage(responseLanguage: string): void {
    const langInstruction = `Your response MUST be written in the language corresponding to locale code: '${responseLanguage}'. This is crucial.`;
    const separator = '\n======\n\nIn addition, ';

    const settings = this.getSettings() as any;
    for (const key of Object.keys(settings)) {
      const setting = settings[key];
      if (setting && typeof setting === 'object' && 'extra_instructions' in setting) {
        const currentExtra = String(setting.extra_instructions || '');
        if (!currentExtra.includes(langInstruction)) {
          if (currentExtra) {
            setting.extra_instructions = currentExtra + separator + langInstruction;
          } else {
            setting.extra_instructions = langInstruction;
          }
        }
      }
    }
  }

  getAiHandler(): AIHandler {
    return this.aiHandler;
  }
}
