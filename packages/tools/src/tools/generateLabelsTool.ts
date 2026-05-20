import type { ConfigSettings } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

export class PRGenerateLabels {
  private gitProvider: any;
  private mainPrLanguage: string;
  private prId: string;
  private aiHandler: AIHandler;
  private vars: Record<string, unknown>;
  private variables: Record<string, unknown>;
  private tokenHandler: any;
  private patchesDiff: string | null;
  private prediction: string | null;
  private data: any;
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.gitProvider = gitProvider;
    this.mainPrLanguage = gitProvider.getMainPrLanguage
      ? gitProvider.getMainPrLanguage(gitProvider.getLanguages(), gitProvider.getFiles())
      : 'Unknown';
    this.prId = gitProvider.getPrId();
    this.aiHandler = aiHandler;
    this.patchesDiff = null;
    this.prediction = null;
    this.data = null;
    this.getSettings = getSettings;

    const s = getSettings();
    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      description: gitProvider.getPrDescription({ full: false }),
      language: this.mainPrLanguage,
      diff: '',
      extraInstructions: s.pr_description?.extra_instructions || '',
      commitMessagesStr: gitProvider.getCommitMessages(),
      enableCustomLabels: s.config?.enable_custom_labels ?? false,
      customLabelsClass: '',
    };
    this.variables = { ...this.vars };

    this.tokenHandler = null;
  }

  async run(): Promise<string> {
    try {
      console.log(`Generating a PR labels ${this.prId}`);

      if (this.getSettings().config?.publish_output) {
        this.gitProvider.publishComment('Preparing PR labels...', { isTemporary: true });
      }

      await this.preparePrediction();

      console.log(`Preparing answer ${this.prId}`);
      if (this.prediction) {
        this.prepareData();
      } else {
        return '';
      }

      const prLabels = this.prepareLabels();

      if (this.getSettings().config?.publish_output) {
        console.log(`Pushing labels ${this.prId}`);

        const currentLabels = this.gitProvider.getPrLabels() || [];
        const userLabels = this.getUserLabels(currentLabels);
        const allLabels = [...prLabels, ...userLabels];

        if (this.gitProvider.isSupported('getLabels')) {
          this.gitProvider.publishLabels(allLabels);
        } else if (allLabels.length > 0) {
          const value = allLabels.join(', ');
          const prLabelsText = `## PR Labels:\n${value}\n`;
          this.gitProvider.publishComment(prLabelsText, { isTemporary: false });
        }

        this.gitProvider.removeInitialComment();
      }
    } catch (e: any) {
      console.error(`Error generating PR labels ${this.prId}: ${e.message}`);
    }

    return '';
  }

  private async preparePrediction(): Promise<void> {
    console.log(`Getting PR diff ${this.prId}`);
    const model = this.getSettings().config?.model || 'gpt-4';
    this.patchesDiff = this.getPrDiff(model);
    console.log(`Getting AI prediction ${this.prId}`);
    this.prediction = await this.getPrediction(model);
  }

  private async getPrediction(model: string): Promise<string> {
    const variables = { ...this.vars };
    variables.diff = this.patchesDiff;

    this.setCustomLabels(variables);
    this.variables = variables;

    const systemPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_custom_labels_prompt?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_custom_labels_prompt?.user || '',
      variables
    );

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    return response.content;
  }

  private prepareData(): void {
    this.data = this.loadYaml((this.prediction || '').trim());
  }

  private prepareLabels(): string[] {
    let prTypes: string[] = [];

    if (this.data && this.data['labels']) {
      if (Array.isArray(this.data['labels'])) {
        prTypes = this.data['labels'];
      } else if (typeof this.data['labels'] === 'string') {
        prTypes = this.data['labels'].split(',');
      }
    }

    prTypes = prTypes.map((label) => label.trim());

    try {
      const labelsDict = this.variables['labelsMinimalToLabelsDict'] as Record<string, string> | undefined;
      if (labelsDict) {
        prTypes = prTypes.map((label) => labelsDict[label] || label);
      }
    } catch (e: any) {
      console.error(`Error converting labels to original case ${this.prId}: ${e.message}`);
    }

    return prTypes;
  }

  private setCustomLabels(variables: Record<string, unknown>): void {
    const s = this.getSettings();
    if (s.config?.enable_custom_labels) {
      variables.customLabelsClass = 'enabled';
    }
  }

  private getUserLabels(labels: string[]): string[] {
    return labels.filter((l) => !l.startsWith('Review effort') && !l.startsWith('Possible security concern'));
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

  loadYaml(text: string): any {
    try {
      const result: any = {};
      const lines = text.split('\n');
      let currentKey = '';
      let currentValue = '';

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 40) {
          if (currentKey && currentValue.trim()) {
            result[currentKey.trim()] = currentValue.trim();
          }
          currentKey = line.substring(0, colonIdx);
          currentValue = line.substring(colonIdx + 1);
        } else {
          currentValue += '\n' + line;
        }
      }
      if (currentKey && currentValue.trim()) {
        result[currentKey.trim()] = currentValue.trim();
      }

      if (result['labels'] && typeof result['labels'] === 'string') {
        const val = result['labels'] as string;
        if (val.startsWith('-') || val.startsWith('[')) {
          result['labels'] = this.parseArrayValue(val);
        }
      }

      return result;
    } catch {
      return null;
    }
  }

  private parseArrayValue(val: string): string[] {
    const items: string[] = [];
    const lines = val.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('-')) {
        items.push(trimmed.replace(/^- /, '').trim());
      }
    }
    return items.length > 0 ? items : val.split(',').map((s) => s.trim());
  }
}
