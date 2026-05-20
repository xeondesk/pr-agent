import type { ConfigSettings } from '@pr-agent/types';

export class PRConfig {
  private gitProvider: any;
  private getSettings: () => ConfigSettings;

  constructor(
    _prUrl: string,
    _args: string[] | undefined = undefined,
    _aiHandler: any,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.gitProvider = gitProvider;
    this.getSettings = getSettings;
  }

  async run(): Promise<string> {
    console.log('Getting configuration settings...');
    console.log('Preparing configs...');
    const prComment = this.preparePrConfigs();

    if (this.getSettings().config?.publish_output) {
      console.log('Pushing configs...');
      this.gitProvider.publishComment(prComment);
      this.gitProvider.removeInitialComment();
    }

    return '';
  }

  private preparePrConfigs(): string {
    const s = this.getSettings();
    const relevantConfigs: Record<string, Record<string, unknown>> = {};

    const configKeys = Object.keys(s as any);
    const configurationHeaders = configKeys.map((k) => k.toLowerCase());

    for (const [header, configs] of Object.entries(s as any)) {
      const headerLower = header.toLowerCase();
      if (
        (headerLower.startsWith('pr_') || headerLower.startsWith('config')) &&
        configurationHeaders.includes(headerLower) &&
        configs &&
        typeof configs === 'object'
      ) {
        relevantConfigs[header] = configs as Record<string, unknown>;
      }
    }

    const skipKeys = [
      'ai_disclaimer', 'ai_disclaimer_title', 'analytics_folder', 'secret_provider',
      'app_id', 'redirect', 'trial_prefix_message', 'no_eligible_message',
      'identity_provider', 'allowed_repos', 'app_name', 'personal_access_token',
      'shared_secret', 'key', 'aws_access_key_id', 'aws_secret_access_key',
      'user_token', 'private_key', 'private_key_id', 'client_id', 'client_secret',
      'token', 'bearer_token', 'jira_api_token', 'webhook_secret',
    ];
    const partialSkipKeys = ['key', 'secret', 'token', 'private'];

    const extraSkipKeys = (s.config as any)?.skip_keys || [];
    const allSkipKeys = [...skipKeys, ...extraSkipKeys].map((k) => k.toLowerCase());

    let markdownText =
      '<details> <summary><strong>🛠️ PR-Agent Configurations:</strong></summary> \n\n';
    markdownText += '\n\n```yaml\n\n';

    for (const [header, configs] of Object.entries(relevantConfigs)) {
      if (Object.keys(configs).length > 0) {
        markdownText += '\n\n';
        markdownText += `==================== ${header} ====================`;
      }

      for (const [key, value] of Object.entries(configs)) {
        const keyLower = key.toLowerCase();
        if (allSkipKeys.includes(keyLower)) continue;
        if (partialSkipKeys.some((sk) => keyLower.includes(sk))) continue;

        const valueStr = typeof value === 'string' ? JSON.stringify(value) : String(value);
        markdownText += `\n${header.toLowerCase()}.${keyLower} = ${valueStr}  `;
      }
    }

    markdownText += '\n```';
    markdownText += '\n</details>\n';

    console.log('Possible Configurations outputted to PR comment');
    return markdownText;
  }
}
