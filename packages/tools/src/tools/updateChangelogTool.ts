import type { ConfigSettings } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

const CHANGELOG_LINES = 50;

export class PRUpdateChangelog {
  private gitProvider: any;
  private mainLanguage: string;
  private commitChangelog: boolean;
  private changelogFileStr: string;
  private changelogFile: string;
  private aiHandler: AIHandler;
  private patchesDiff: string | null;
  private prediction: string | null;
  private cliMode: boolean;
  private vars: Record<string, unknown>;
  private tokenHandler: any;
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    cliMode: boolean = false,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.gitProvider = gitProvider;
    this.mainLanguage = gitProvider.getMainPrLanguage
      ? gitProvider.getMainPrLanguage(gitProvider.getLanguages(), gitProvider.getFiles())
      : 'Unknown';
    this.aiHandler = aiHandler;
    this.patchesDiff = null;
    this.prediction = null;
    this.cliMode = cliMode;
    this.changelogFile = '';
    this.changelogFileStr = '';
    this.getSettings = getSettings;

    const s = getSettings();
    this.commitChangelog = s.pr_update_changelog?.push_changelog_changes ?? false;
    this.getChangelogFile();

    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      description: gitProvider.getPrDescription(),
      language: this.mainLanguage,
      diff: '',
      prLink: '',
      changelogFileStr: this.changelogFileStr,
      today: new Date().toISOString().split('T')[0],
      extraInstructions: s.pr_update_changelog?.extra_instructions || '',
      commitMessagesStr: gitProvider.getCommitMessages(),
    };

    this.tokenHandler = null;
  }

  async run(): Promise<void> {
    console.log('Updating the changelog...');

    if (this.getSettings().pr_update_changelog?.push_changelog_changes && !this.gitProvider.createOrUpdatePrFile) {
      console.error('Pushing changelog changes is not currently supported for this code platform');
      if (this.getSettings().config?.publish_output) {
        this.gitProvider.publishComment(
          'Pushing changelog changes is not currently supported for this code platform'
        );
      }
      return;
    }

    if (this.getSettings().config?.publish_output) {
      this.gitProvider.publishComment('Preparing changelog updates...', { isTemporary: true });
    }

    await this.preparePrediction();

    const [newFileContent, answer] = this.prepareChangelogUpdate();

    if (this.getSettings().config?.publish_output) {
      this.gitProvider.removeInitialComment();
      if (this.commitChangelog) {
        this.pushChangelogUpdate(newFileContent, answer);
      } else {
        this.gitProvider.publishComment(`**Changelog updates:** 🔄\n\n${answer}`);
      }
    }
  }

  private async preparePrediction(): Promise<void> {
    const model = this.getSettings().config?.model || 'gpt-4';
    this.patchesDiff = this.getPrDiff(model);
    if (this.patchesDiff) {
      console.log('PR diff', this.patchesDiff);
      this.prediction = await this.getPrediction(model);
    } else {
      console.error('Error getting PR diff');
      this.prediction = '';
    }
  }

  private async getPrediction(model: string): Promise<string> {
    const variables = { ...this.vars };
    variables.diff = this.patchesDiff;

    if (this.getSettings().pr_update_changelog?.add_pr_link) {
      variables.prLink = this.gitProvider.getPrUrl();
    }

    const systemPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_update_changelog_prompt?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_update_changelog_prompt?.user || '',
      variables
    );

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    let response = (await this.aiHandler.complete(messages)).content;

    response = response.trim();
    if (!response) return '';
    if (response.startsWith('```')) {
      const lines = response.split('\n');
      response = lines.slice(1).join('\n');
    }
    response = response.replace(/`+$/, '').trim();

    return response;
  }

  private prepareChangelogUpdate(): [string, string] {
    let answer = (this.prediction || '').trim();
    answer = answer.replace(/^```+/, '').replace(/```+$/, '').trim();

    const existingContent = this.changelogFile || '';
    let newFileContent: string;

    if (existingContent) {
      newFileContent = answer + '\n\n' + this.changelogFile;
    } else {
      newFileContent = answer;
    }

    if (!this.commitChangelog) {
      answer +=
        "\n\n\n>to commit the new content to the CHANGELOG.md file, please type:" +
        "\n>'/update_changelog --pr_update_changelog.push_changelog_changes=true'\n";
    }

    return [newFileContent, answer];
  }

  private pushChangelogUpdate(newFileContent: string, answer: string): void {
    const skipCi = this.getSettings().pr_update_changelog?.skip_ci_on_push ?? true;
    const commitMessage = skipCi ? '[skip ci] Update CHANGELOG.md' : 'Update CHANGELOG.md';

    this.gitProvider.createOrUpdatePrFile({
      filePath: 'CHANGELOG.md',
      branch: this.gitProvider.getPrBranch(),
      contents: newFileContent,
      message: commitMessage,
    });

    setTimeout(() => {
      try {
        if (this.getSettings().config?.git_provider === 'github') {
          const commits = this.gitProvider.getCommits();
          const lastCommitId = commits?.[commits.length - 1];
          if (lastCommitId) {
            const answerLines = answer.split('\n').length;
            this.gitProvider.createReview({
              commit: lastCommitId,
              body: 'CHANGELOG.md update',
              comments: [
                {
                  path: 'CHANGELOG.md',
                  line: Math.max(2, answerLines),
                  start_line: 1,
                },
              ],
            });
          }
        }
      } catch {
        this.gitProvider.publishComment(`**Changelog updates: 🔄**\n\n${answer}`);
      }
    }, 5000);
  }

  private getDefaultChangelog(): string {
    return `
Example:
## <current_date>

### Added
...
### Changed
...
### Fixed
...
`;
  }

  private getChangelogFile(): void {
    try {
      let content = this.gitProvider.getPrFileContent('CHANGELOG.md', this.gitProvider.getPrBranch());

      if (content instanceof Buffer) {
        content = content.toString('utf-8');
      }

      this.changelogFile = content || '';
      const lines = this.changelogFile.split('\n').slice(0, CHANGELOG_LINES);
      this.changelogFileStr = lines.join('\n');
    } catch (e: any) {
      console.warn(`Error getting changelog file: ${e.message}`);
      this.changelogFileStr = '';
      this.changelogFile = '';
      return;
    }

    if (!this.changelogFileStr) {
      this.changelogFileStr = this.getDefaultChangelog();
    }
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
}
