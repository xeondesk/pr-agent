import type { ConfigSettings } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';
import { HelpMessage } from '../servers/help.js';

export class PRHelpMessage {
  private gitProvider: any;
  private aiHandler: AIHandler;
  private questionStr: string;
  private returnAsString: boolean;
  private vars: Record<string, unknown>;
  private tokenHandler: any;
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any,
    returnAsString: boolean = false
  ) {
    this.gitProvider = gitProvider;
    this.aiHandler = aiHandler;
    this.questionStr = this.parseArgs(args);
    this.returnAsString = returnAsString;
    this.getSettings = getSettings;

    if (this.questionStr) {
      this.vars = {
        question: this.questionStr,
        snippets: '',
      };
      this.tokenHandler = null;
    } else {
      this.vars = { question: '', snippets: '' };
      this.tokenHandler = null;
    }
  }

  private parseArgs(args: string[] | undefined): string {
    if (args && args.length > 0) {
      return args.join(' ');
    }
    return '';
  }

  async run(): Promise<string> {
    try {
      if (this.questionStr) {
        return await this.runWithQuestion();
      } else {
        return await this.runWithoutQuestion();
      }
    } catch (e: any) {
      console.error(`Error while running PRHelpMessage: ${e.message}`);
    }
    return '';
  }

  private async runWithQuestion(): Promise<string> {
    console.log(`Answering a PR question about the PR`);

    const openaiKey = (this.getSettings() as any).openai?.key;
    if (!openaiKey) {
      if (this.getSettings().config?.publish_output) {
        this.gitProvider.publishComment(
          'The `Help` tool chat feature requires an OpenAI API key for calculating embeddings'
        );
      } else {
        console.error('The `Help` tool chat feature requires an OpenAI API key for calculating embeddings');
      }
      return '';
    }

    const s = this.getSettings();
    const model = s.config?.model || 'gpt-4';
    const maxTokens = this.getMaxTokens(model);
    const deltaOutput = 2000;
    const tokenCount = 0; // placeholder - would need full doc scanning

    let docsPrompt = '';
    if (tokenCount > maxTokens - deltaOutput) {
      console.log(`Token count exceeds limit. Skipping the PR Help message.`);
      docsPrompt = this.clipTokens(docsPrompt, maxTokens - deltaOutput);
    }
    this.vars.snippets = docsPrompt.trim();

    const response = await this.preparePrediction(model);
    const responseYaml = this.loadYaml(response);

    if (typeof responseYaml === 'string') {
      console.warn(`failing to parse response: ${responseYaml}`);
      if (this.getSettings().config?.publish_output) {
        let answerStr = `### Question: \n${this.questionStr}\n\n`;
        answerStr += `### Answer:\n\n`;
        answerStr += responseYaml;
        this.gitProvider.publishComment(answerStr);
      }
      return '';
    }

    const responseStr = responseYaml?.response;
    const relevantSections = responseYaml?.relevant_sections;

    if (!relevantSections) {
      console.log(`Could not find relevant answer for the question: ${this.questionStr}`);
      if (this.getSettings().config?.publish_output) {
        let answerStr = `### Question: \n${this.questionStr}\n\n`;
        answerStr += `### Answer:\n\n`;
        answerStr += 'Could not find relevant information to answer the question. Please provide more details and try again.';
        this.gitProvider.publishComment(answerStr);
      }
      return '';
    }

    let answerStr = '';
    if (responseStr) {
      answerStr += `### Question: \n${this.questionStr}\n\n`;
      answerStr += `### Answer:\n${responseStr.trim()}\n\n`;
      answerStr += `#### Relevant Sources:\n\n`;
      const basePath = 'https://qodo-merge-docs.qodo.ai/';

      for (const section of relevantSections) {
        const file = (section.file_name || '').replace(/\.md$/, '');
        const header = (section.relevant_section_header_string || '').trim();
        if (header) {
          const markdownHeader = this.formatMarkdownHeader(header);
          answerStr += `> - ${basePath}${file}#${markdownHeader}\n`;
        } else {
          answerStr += `> - ${basePath}${file}\n`;
        }
      }
    }

    if (this.getSettings().config?.publish_output) {
      this.gitProvider.publishComment(answerStr);
    } else {
      console.log(`Answer:\n${answerStr}`);
    }

    return '';
  }

  private async runWithoutQuestion(): Promise<string> {
    if (!this.gitProvider.isSupported('gfmMarkdown')) {
      if (this.gitProvider.constructor?.name !== 'BitbucketServerProvider') {
        this.gitProvider.publishComment(
          'The `Help` tool requires gfm markdown, which is not supported by your code platform.'
        );
        return '';
      }
    }

    console.log('Getting PR Help Message...');

    let prComment = '## PR Agent Walkthrough 🤖\n\n';
    prComment += 'Welcome to the PR Agent, an AI-powered tool for automated pull request analysis, feedback, suggestions and more.';
    prComment += '\n\nHere is a list of tools you can use to interact with the PR Agent:\n';
    const basePath = 'https://pr-agent-docs.codium.ai/tools';

    const toolNames = [
      `[DESCRIBE](${basePath}/describe/)`,
      `[REVIEW](${basePath}/review/)`,
      `[IMPROVE](${basePath}/improve/)`,
      `[UPDATE CHANGELOG](${basePath}/update_changelog/)`,
      `[HELP DOCS](${basePath}/help_docs/)`,
      `[ADD DOCS](${basePath}/add_docs/)`,
      `[ASK](${basePath}/ask/)`,
      `[GENERATE CUSTOM LABELS](${basePath}/generate_labels/)`,
    ];

    const descriptions = [
      'Generates PR description - title, type, summary, code walkthrough and labels',
      'Adjustable feedback about the PR, possible issues, security concerns, review effort and more',
      'Code suggestions for improving the PR',
      'Automatically updates the changelog',
      'Answers a question regarding this repository, or a given one, based on given documentation path',
      'Generates documentation to methods/functions/classes that changed in the PR',
      'Answering free-text questions about the PR',
      'Generates custom labels for the PR, based on specific guidelines defined by the user',
    ];

    const commands = [
      '`/describe`', '`/review`', '`/improve`', '`/update_changelog`',
      '`/help_docs`', '`/add_docs`', '`/ask`', '`/generate_labels`',
    ];

    const checkboxList = [
      ' - [ ] Run <!-- /describe -->',
      ' - [ ] Run <!-- /review -->',
      ' - [ ] Run <!-- /improve -->',
      ' - [ ] Run <!-- /update_changelog -->',
      ' - [ ] Run <!-- /help_docs -->',
      ' - [ ] Run <!-- /add_docs -->',
      '[*]', '[*]',
    ];

    const isGithubProvider = this.gitProvider.constructor?.name === 'GithubProvider';
    const disableCheckboxes = (this.getSettings().config as any)?.disable_checkboxes ?? false;

    if (isGithubProvider && !disableCheckboxes) {
      prComment += `<table><tr align='left'><th align='left'>Tool</th><th align='left'>Description</th><th align='left'>Trigger Interactively :gem:</th></tr>`;
      for (let i = 0; i < toolNames.length; i++) {
        prComment += `\n<tr><td align='left'>\n\n<strong>${toolNames[i]}</strong></td>\n<td>${descriptions[i]}</td>\n<td>\n\n${checkboxList[i]}\n</td></tr>`;
      }
      prComment += '</table>\n\n';
      prComment += `\n\n(1) Note that each tool can be [triggered automatically](https://pr-agent-docs.codium.ai/usage-guide/automations_and_usage/#github-app-automatic-tools-when-a-new-pr-is-opened) when a new PR is opened, or called manually by [commenting on a PR](https://pr-agent-docs.codium.ai/usage-guide/automations_and_usage/#online-usage).`;
      prComment += `\n\n(2) Tools marked with [*] require additional parameters to be passed. For example, to invoke the \`/ask\` tool, you need to comment on a PR: \`/ask "<question content>"\`. See the relevant documentation for each tool for more details.`;
    } else {
      prComment += `<table><tr align='left'><th align='left'>Tool</th><th align='left'>Command</th><th align='left'>Description</th></tr>`;
      for (let i = 0; i < toolNames.length; i++) {
        prComment += `\n<tr><td align='left'>\n\n<strong>${toolNames[i]}</strong></td><td>${commands[i]}</td><td>${descriptions[i]}</td></tr>`;
      }
      prComment += '</table>\n\n';
      prComment += `\n\nNote that each tool can be [invoked automatically](https://pr-agent-docs.codium.ai/usage-guide/automations_and_usage/) when a new PR is opened, or called manually by [commenting on a PR](https://pr-agent-docs.codium.ai/usage-guide/automations_and_usage/#online-usage).`;
    }

    if (this.getSettings().config?.publish_output) {
      this.gitProvider.publishComment(prComment);
    }

    return '';
  }

  private async preparePrediction(model: string): Promise<string> {
    try {
      const variables = { ...this.vars };
      const systemPrompt = this.renderTemplate(
        (this.getSettings() as any).pr_help_prompts?.system || '',
        variables
      );
      const userPrompt = this.renderTemplate(
        (this.getSettings() as any).pr_help_prompts?.user || '',
        variables
      );

      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await this.aiHandler.complete(messages);
      return response.content;
    } catch (e: any) {
      console.error(`Error while preparing prediction: ${e.message}`);
      return '';
    }
  }

  formatMarkdownHeader(header: string): string {
    try {
      let cleaned = header.replace(/^[#\s💎\n]+|[#\s💎\n]+$/g, '');
      const replacements: Record<string, string> = {
        "'": '', '`': '', '(': '', ')': '', ',': '', '.': '', '?': '', '!': '', ' ': '-',
      };
      const pattern = new RegExp(Object.keys(replacements).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      return cleaned.replace(pattern, (m) => replacements[m] || m).toLowerCase();
    } catch {
      return '';
    }
  }

  prepareRelevantSnippets(simResults: any[]): { pages: string[]; headers: string[]; snippets: string } {
    const relevantSnippetsFull: string[] = [];
    const relevantPagesFull: string[] = [];
    const relevantSnippetsFullHeader: string[] = [];

    for (const s of simResults) {
      const page = s[0]?.metadata?.source || '';
      const content = s[0]?.page_content || '';
      relevantSnippetsFull.push(content);
      relevantSnippetsFullHeader.push(this.extractHeader(content));
      relevantPagesFull.push(page);
    }

    let snippetsStr = '';
    for (let i = 0; i < relevantSnippetsFull.length; i++) {
      snippetsStr += `Snippet ${i + 1}:\n\n${relevantSnippetsFull[i]}\n\n`;
      snippetsStr += '-------------------\n\n';
    }

    return { pages: relevantPagesFull, headers: relevantSnippetsFullHeader, snippets: snippetsStr };
  }

  private extractHeader(snippet: string): string {
    const lines = snippet.split('===Snippet content===')[0].split('\n');
    let highestHeader = '';
    for (const line of lines.reverse()) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Header ')) {
        highestHeader = trimmed.split(': ')[1];
        break;
      }
    }
    if (highestHeader) {
      return `#${highestHeader.toLowerCase().replace(/\s+/g, '-')}`;
    }
    return '';
  }

  private getMaxTokens(model: string): number {
    const { MAX_TOKENS } = require('@pr-agent/types');
    return (MAX_TOKENS as Record<string, number>)[model] || 128000;
  }

  private clipTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  }

  renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = variables[trimmedKey];
      return value !== undefined ? String(value) : match;
    });
  }

  loadYaml(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      try {
        const result: any = {};
        const lines = text.split('\n');
        let currentKey = '';
        let currentValue = '';

        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0 && colonIdx < 40) {
            if (currentKey && currentValue.trim()) {
              result[currentKey.trim()] = this.tryParseValue(currentValue.trim());
            }
            currentKey = line.substring(0, colonIdx);
            currentValue = line.substring(colonIdx + 1);
          } else {
            currentValue += '\n' + line;
          }
        }
        if (currentKey && currentValue.trim()) {
          result[currentKey.trim()] = this.tryParseValue(currentValue.trim());
        }
        return result;
      } catch {
        return text;
      }
    }
  }

  private tryParseValue(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
