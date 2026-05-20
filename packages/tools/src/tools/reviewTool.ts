import { BaseTool } from '../baseTool.js';
import type { ToolInput, ToolResult, FilePatchInfo, ConfigSettings, PRReviewHeader, ModelType } from '@pr-agent/types';
import { PRReviewHeader as PRReviewHeaderEnum, ModelType as ModelTypeEnum } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

interface IncrementalPR {
  isIncremental: boolean;
  commitsRange: string[];
  firstNewCommitSha?: string;
  lastSeenCommit?: { commit: { author: { date: Date } } };
}

interface ReviewData {
  review?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ReviewTool {
  private gitProvider: any;
  private args: string[] | undefined;
  private incremental: IncrementalPR;
  private mainLanguage: string;
  private prUrl: string;
  private isAnswer: boolean;
  private isAuto: boolean;
  private aiHandler: AIHandler;
  private patchesDiff: string | null;
  private prediction: string | null;
  private vars: Record<string, unknown>;
  private prDescription: string;
  private prDescriptionFiles: any[];
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    isAnswer: boolean = false,
    isAuto: boolean = false,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.gitProvider = gitProvider;
    this.args = args;
    this.incremental = this.parseIncremental(args);
    if (this.incremental.isIncremental) {
      this.gitProvider.getIncrementalCommits(this.incremental);
    }

    this.mainLanguage = gitProvider.getMainPrLanguage
      ? gitProvider.getMainPrLanguage(gitProvider.getLanguages(), gitProvider.getFiles())
      : 'Unknown';
    this.prUrl = prUrl;
    this.isAnswer = isAnswer;
    this.isAuto = isAuto;

    if (this.isAnswer && !this.gitProvider.isSupported('getIssueComments')) {
      throw new Error(`Answer mode is not supported for ${getSettings().config?.git_provider} for now`);
    }
    this.aiHandler = aiHandler;
    this.patchesDiff = null;
    this.prediction = null;
    const { questionStr, answerStr } = this.getUserAnswers();
    const descResult = this.gitProvider.getPrDescription({ splitChangesWalkthrough: true });
    this.prDescription = descResult?.description || '';
    this.prDescriptionFiles = descResult?.files || [];

    const s = getSettings();
    this.vars = {
      title: this.gitProvider.pr?.title || '',
      branch: this.gitProvider.getPrBranch(),
      description: this.prDescription,
      language: this.mainLanguage,
      diff: '',
      numPrFiles: this.gitProvider.getNumOfFiles(),
      numMaxFindings: s.pr_reviewer?.num_max_findings || 5,
      requireScore: s.pr_reviewer?.require_score_review ?? false,
      requireTests: s.pr_reviewer?.require_tests_review ?? false,
      requireEstimateEffortToReview: s.pr_reviewer?.require_estimate_effort_to_review ?? false,
      requireEstimateContributionTimeCost: s.pr_reviewer?.require_estimate_contribution_time_cost ?? false,
      requireCanBeSplitReview: s.pr_reviewer?.require_can_be_split_review ?? false,
      requireSecurityReview: s.pr_reviewer?.require_security_review ?? false,
      requireTodoScan: s.pr_reviewer?.require_todo_scan ?? false,
      questionStr,
      answerStr,
      extraInstructions: s.pr_reviewer?.extra_instructions || '',
      commitMessagesStr: this.gitProvider.getCommitMessages(),
      customLabels: '',
      enableCustomLabels: s.config?.enable_custom_labels ?? false,
      isAiMetadata: false,
      relatedTickets: [],
      duplicatePromptExamples: s.config?.duplicate_prompt_examples ?? false,
      date: new Date().toISOString().split('T')[0],
    };
    this.getSettings = getSettings;
  }

  parseIncremental(args: string[] | undefined): IncrementalPR {
    if (args && args.length >= 1 && args[0] === '-i') {
      return { isIncremental: true, commitsRange: [] };
    }
    return { isIncremental: false, commitsRange: [] };
  }

  async run(): Promise<void> {
    try {
      const files = this.gitProvider.getFiles();
      if (!files || files.length === 0) {
        console.log(`PR has no files: ${this.prUrl}, skipping review`);
        return;
      }

      if (this.incremental.isIncremental && !this.canRunIncrementalReview()) {
        return;
      }

      console.log(`Reviewing PR: ${this.prUrl} ...`);

      await this.extractAndCachePrTickets(this.gitProvider, this.vars);

      if (this.incremental.isIncremental && this.gitProvider.unreviewedFilesSet !== undefined && !this.gitProvider.unreviewedFilesSet) {
        console.log(`Incremental review is enabled for ${this.prUrl} but there are no new files`);
        let previousReviewUrl = '';
        if (this.gitProvider.previousReview) {
          previousReviewUrl = this.gitProvider.previousReview.htmlUrl;
        }
        if (this.getSettings().config?.publish_output) {
          this.gitProvider.publishComment(`Incremental Review Skipped\nNo files were changed since the [previous PR Review](${previousReviewUrl})`);
        }
        return;
      }

      if (this.getSettings().config?.publish_output && !this.getSettings().config?.is_auto_command) {
        this.gitProvider.publishComment('Preparing review...', { isTemporary: true });
      }

      await this.preparePrediction();
      if (!this.prediction) {
        this.gitProvider.removeInitialComment();
        return;
      }

      const prReview = this.preparePrReview();

      const shouldPublish = this.getSettings().config?.publish_output && this.shouldPublishReviewNoSuggestions(prReview);
      if (!shouldPublish) {
        const reason = 'Review output is not published';
        console.log(reason);
        return;
      }

      if (this.getSettings().pr_reviewer?.persistent_comment && !this.incremental.isIncremental) {
        const finalUpdateMessage = this.getSettings().pr_reviewer?.final_update_message ?? true;
        this.gitProvider.publishPersistentComment(prReview, {
          initialHeader: `${PRReviewHeaderEnum.REGULAR} \u{1F50D}`,
          updateHeader: true,
          finalUpdateMessage,
        });
      } else {
        this.gitProvider.publishComment(prReview);
      }

      this.gitProvider.removeInitialComment();
    } catch (e: any) {
      console.error(`Failed to review PR: ${e.message}`);
    }
  }

  private shouldPublishReviewNoSuggestions(prReview: string): boolean {
    const pub = this.getSettings().pr_reviewer?.publish_output_no_suggestions;
    return pub !== undefined ? pub : true;
  }

  private async preparePrediction(): Promise<void> {
    const model = this.getSettings().config?.model || 'gpt-4';
    this.patchesDiff = this.getPrDiff(model);
    if (this.patchesDiff) {
      console.log('PR diff', this.patchesDiff);
      this.prediction = await this.getPrediction(model);
    } else {
      console.warn(`Empty diff for PR: ${this.prUrl}`);
      this.prediction = null;
    }
  }

  private async getPrediction(model: string): Promise<string> {
    const variables = { ...this.vars };
    variables.diff = this.patchesDiff;

    const systemPrompt = this.renderTemplate(
      this.getSettings().pr_review_prompt?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      this.getSettings().pr_review_prompt?.user || '',
      variables
    );

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    return response.content;
  }

  private preparePrReview(): string {
    const data = this.loadYaml(this.prediction || '', {
      keysFixYaml: [
        'ticket_compliance_check',
        'estimated_effort_to_review_[1-5]:',
        'security_concerns:',
        'key_issues_to_review:',
        'relevant_file:',
        'relevant_line:',
        'suggestion:',
      ],
      firstKey: 'review',
      lastKey: 'security_concerns',
    });

    if (!data || !data['review']) {
      console.error('Failed to parse review data', data);
      return '';
    }

    if (data['review']['key_issues_to_review'] !== undefined) {
      const keyIssues = data['review']['key_issues_to_review'];
      delete data['review']['key_issues_to_review'];
      data['review']['key_issues_to_review'] = keyIssues;
    }

    let incrementalReviewMarkdownText: string | null = null;
    if (this.incremental.isIncremental && this.gitProvider.incremental?.firstNewCommitSha) {
      const lastCommitUrl = `${this.gitProvider.getPrUrl()}/commits/${this.gitProvider.incremental.firstNewCommitSha}`;
      incrementalReviewMarkdownText = `Starting from commit ${lastCommitUrl}`;
    }

    let markdownText = this.convertToMarkdownV2(
      data,
      this.gitProvider.isSupported('gfmMarkdown'),
      incrementalReviewMarkdownText
    );

    if (this.gitProvider.isSupported('gfmMarkdown') && this.getSettings().pr_reviewer?.enable_help_text) {
      markdownText +=
        '<hr>\n\n<details> <summary><strong>\u{1F4A1} Tool usage guide:</strong></summary><hr> \n\n';
      markdownText += this.getReviewUsageGuide();
      markdownText += '\n</details>\n';
    }

    this.setReviewLabels(data);

    return markdownText || '';
  }

  private getUserAnswers(): { questionStr: string; answerStr: string } {
    let questionStr = '';
    let answerStr = '';

    if (this.isAnswer) {
      const discussionMessages = this.gitProvider.getIssueComments();
      for (const message of discussionMessages.reversed || discussionMessages) {
        if (message.body && message.body.includes('Questions to better understand the PR:')) {
          questionStr = message.body;
        } else if (message.body && message.body.includes('/answer')) {
          answerStr = message.body;
        }
        if (answerStr && questionStr) break;
      }
    }

    return { questionStr, answerStr };
  }

  getPreviousReviewComment(): any {
    try {
      if (this.gitProvider.getPreviousReview) {
        return this.gitProvider.getPreviousReview({
          full: !this.incremental.isIncremental,
          incremental: this.incremental.isIncremental,
        });
      }
    } catch (e: any) {
      console.error(`Failed to get previous review comment, error: ${e.message}`);
    }
    return null;
  }

  removePreviousReviewComment(comment: any): void {
    try {
      if (comment) {
        this.gitProvider.removeComment(comment);
      }
    } catch (e: any) {
      console.error(`Failed to remove previous review comment, error: ${e.message}`);
    }
  }

  private canRunIncrementalReview(): boolean {
    if (this.isAuto && !this.incremental.firstNewCommitSha) {
      console.log(`Incremental review is enabled for ${this.prUrl} but there are no new commits`);
      return false;
    }

    if (!this.gitProvider.getIncrementalCommits) {
      console.log(`Incremental review is not supported`);
      return false;
    }

    const numNewCommits = this.incremental.commitsRange?.length || 0;
    const numCommitsThreshold = this.getSettings().pr_reviewer?.minimal_commits_for_incremental_review || 1;
    const notEnoughCommits = numNewCommits < numCommitsThreshold;

    const recentMinutesThreshold = this.getSettings().pr_reviewer?.minimal_minutes_for_incremental_review || 10;
    const recentCommitsThreshold = new Date(Date.now() - recentMinutesThreshold * 60 * 1000);
    const lastSeenCommitDate = this.incremental.lastSeenCommit?.commit?.author?.date
      ? new Date(this.incremental.lastSeenCommit.commit.author.date)
      : null;
    const allCommitsTooRecent = lastSeenCommitDate
      ? lastSeenCommitDate > recentCommitsThreshold
      : false;

    const requireAll = this.getSettings().pr_reviewer?.require_all_thresholds_for_incremental_review ?? false;
    const condition = requireAll
      ? notEnoughCommits && allCommitsTooRecent
      : notEnoughCommits || allCommitsTooRecent;

    if (condition) {
      console.log(
        `Incremental review is enabled for ${this.prUrl} but didn't pass the threshold check to run:`
      );
      return false;
    }
    return true;
  }

  private setReviewLabels(data: any): void {
    if (!this.getSettings().config?.publish_output) return;

    const settings = this.getSettings();
    if (!settings.pr_reviewer?.require_estimate_effort_to_review) {
      if (settings.pr_reviewer) (settings.pr_reviewer as any).enable_review_labels_effort = false;
    }
    if (!settings.pr_reviewer?.require_security_review) {
      if (settings.pr_reviewer) (settings.pr_reviewer as any).enable_review_labels_security = false;
    }

    if (
      settings.pr_reviewer?.enable_review_labels_security ||
      settings.pr_reviewer?.enable_review_labels_effort
    ) {
      try {
        const reviewLabels: string[] = [];
        if (settings.pr_reviewer?.enable_review_labels_effort && data?.review) {
          const estimatedEffort = data.review['estimated_effort_to_review_[1-5]'];
          let estimatedEffortNumber = 0;
          if (typeof estimatedEffort === 'string') {
            estimatedEffortNumber = parseInt(estimatedEffort.split(',')[0], 10);
          } else if (typeof estimatedEffort === 'number') {
            estimatedEffortNumber = estimatedEffort;
          }
          if (!isNaN(estimatedEffortNumber) && estimatedEffortNumber >= 1 && estimatedEffortNumber <= 5) {
            reviewLabels.push(`Review effort ${estimatedEffortNumber}/5`);
          }
        }
        if (settings.pr_reviewer?.enable_review_labels_security && settings.pr_reviewer?.require_security_review && data?.review) {
          const securityConcerns = data.review['security_concerns'] || '';
          const securityConcernsBool =
            securityConcerns.toLowerCase().includes('yes') ||
            securityConcerns.toLowerCase().includes('true');
          if (securityConcernsBool) {
            reviewLabels.push('Possible security concern');
          }
        }

        const currentLabels = this.gitProvider.getPrLabels({ update: true }) || [];
        const currentLabelsFiltered = currentLabels.filter(
          (label: string) =>
            !label.toLowerCase().startsWith('review effort') &&
            !label.toLowerCase().startsWith('possible security concern')
        );
        const newLabels = [...reviewLabels, ...currentLabelsFiltered];
        if (
          (currentLabels.length > 0 || reviewLabels.length > 0) &&
          JSON.stringify([...newLabels].sort()) !== JSON.stringify([...currentLabels].sort())
        ) {
          console.log(`Setting review labels:`, newLabels);
          this.gitProvider.publishLabels(newLabels);
        }
      } catch (e: any) {
        console.error(`Failed to set review labels, error: ${e.message}`);
      }
    }
  }

  autoApproveLogic(): void {
    const settings = this.getSettings();
    if (settings.config?.enable_auto_approval) {
      const isAutoApproved = this.gitProvider.autoApprove();
      if (isAutoApproved) {
        console.log('Auto-approved PR');
        this.gitProvider.publishComment('Auto-approved PR');
      }
    } else {
      console.log('Auto-approval option is disabled');
      this.gitProvider.publishComment(
        'Auto-approval option for PR-Agent is disabled. You can enable it via a configuration file.'
      );
    }
  }

  getPrDiff(model: string): string | null {
    if (this.gitProvider.getPrDiff) {
      return this.gitProvider.getPrDiff(this.gitProvider, null, model, {
        addLineNumbersToHunks: true,
        disableExtraLines: false,
      });
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

  loadYaml(
    text: string,
    opts?: { keysFixYaml?: string[]; firstKey?: string; lastKey?: string }
  ): any {
    try {
      const lines = text.split('\n');
      const result: any = {};
      let currentKey = '';
      let currentValue = '';

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 30) {
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

      if (opts?.firstKey && result[opts.firstKey]) {
        const val = result[opts.firstKey];
        if (typeof val === 'string') {
          result[opts.firstKey] = this.loadYaml(val, opts);
        }
      }

      return result;
    } catch {
      return null;
    }
  }

  convertToMarkdownV2(
    data: any,
    gfmMarkdown: boolean,
    incrementalText: string | null
  ): string {
    let md = '';
    if (incrementalText) {
      md += `### ${incrementalText}\n\n`;
    }

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        md += `### ${key}\n\n`;
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          md += `- **${k}**: ${v}\n`;
        }
        md += '\n';
      } else {
        md += `### ${key}\n\n${value}\n\n`;
      }
    }
    return md;
  }

  getReviewUsageGuide(): string {
    return 'Use `/review` to request a new review. Use `/improve` to get code suggestions.';
  }

  private async extractAndCachePrTickets(gitProvider: any, vars: Record<string, unknown>): Promise<void> {
    const settings = this.getSettings();
    if (!settings.pr_reviewer?.require_ticket_analysis_review) return;

    let relatedTickets: any[] = (settings as any).related_tickets || [];

    if (relatedTickets.length === 0) {
      const ticketsContent = await this.extractTickets(gitProvider);
      if (ticketsContent) {
        for (const ticket of ticketsContent) {
          if (ticket.sub_issues && ticket.sub_issues.length > 0) {
            for (const subIssue of ticket.sub_issues) {
              relatedTickets.push(subIssue);
            }
          }
          relatedTickets.push(ticket);
        }
        vars.relatedTickets = relatedTickets;
      }
    } else {
      vars.relatedTickets = relatedTickets;
    }
  }

  private async extractTickets(gitProvider: any): Promise<any[]> {
    const userDescription = gitProvider.getUserDescription();
    if (!userDescription) return [];

    const ticketPattern = /https:\/\/github[^/]+\/[^/]+\/[^/]+\/issues\/(\d+)/g;
    const matches = userDescription.match(ticketPattern);
    if (!matches) return [];

    const tickets: any[] = [];
    for (const url of matches.slice(0, 3)) {
      try {
        const issueNum = url.match(/issues\/(\d+)/)?.[1];
        if (issueNum) {
          tickets.push({ ticket_url: url, ticket_id: issueNum, title: '', body: '' });
        }
      } catch {
        // skip
      }
    }
    return tickets;
  }
}
