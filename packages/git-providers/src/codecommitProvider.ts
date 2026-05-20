import { URL } from 'url';
import { GitProvider } from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo } from '@pr-agent/types';
import { CodeCommitClient } from './codecommitClient.js';

class PullRequestCCMimic {
  title: string;
  description: string | null = null;
  sourceCommit: string = '';
  sourceBranch: string = '';
  destinationCommit: string = '';
  destinationBranch: string = '';
  diffFiles: FilePatchInfo[] = [];

  constructor(title: string) {
    this.title = title;
  }
}

export class CodeCommitProvider extends GitProvider {
  codecommitClient: CodeCommitClient;
  repoName: string | null = null;
  prNum: number | null = null;
  prData: PullRequestCCMimic | null = null;
  diffFiles: FilePatchInfo[] | null = null;
  gitFiles: unknown[] | null = null;
  prUrl: string = '';

  constructor(prUrl?: string) {
    super();
    this.codecommitClient = new CodeCommitClient();
    if (prUrl) {
      this.setPr(prUrl);
    }
  }

  isSupported(capability: string): boolean {
    if (['get_issue_comments', 'create_inline_comment', 'publish_inline_comments', 'get_labels', 'gfm_markdown'].includes(capability)) {
      return false;
    }
    return true;
  }

  setPr(prUrl: string): void {
    this.prUrl = prUrl;
    const [repoName, prNum] = CodeCommitProvider._parsePrUrl(prUrl);
    this.repoName = repoName;
    this.prNum = prNum;
    this.prData = new PullRequestCCMimic('');
  }

  private async _fetchPrData(): Promise<void> {
    if (!this.repoName || !this.prNum) return;
    const response = await this.codecommitClient.getPr(this.repoName, this.prNum);

    if (response.targets.length === 0) {
      throw new Error(`No targets found in CodeCommit PR: ${this.prNum}`);
    }

    const mimic = new PullRequestCCMimic(response.title);
    mimic.description = response.description;
    mimic.sourceCommit = response.targets[0].sourceCommit;
    mimic.sourceBranch = response.targets[0].sourceBranch;
    mimic.destinationCommit = response.targets[0].destinationCommit;
    mimic.destinationBranch = response.targets[0].destinationBranch;
    this.prData = mimic;
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    if (!this.prNum) return;
    try {
      prBody = prBody.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
      await this.codecommitClient.publishDescription(this.prNum, prTitle, prBody);
    } catch (e) {
      throw new Error(`CodeCommit Cannot publish description for PR: ${this.prNum}`);
    }
  }

  async publishLabels(_labels: string[]): Promise<void> {
    // not implemented
  }

  async getPrLabels(_update?: boolean): Promise<string[]> {
    return [];
  }

  async publishCodeSuggestions(codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    let counter = 1;
    for (const suggestion of codeSuggestions) {
      if (!suggestion['body'] || !suggestion['relevant_file'] || !suggestion['relevant_lines_start']) {
        console.warn(`Skipping code suggestion #${counter}: missing required keys`);
        continue;
      }

      try {
        if (!this.repoName || !this.prNum || !this.prData) continue;
        await this.codecommitClient.publishComment(
          this.repoName,
          this.prNum,
          this.prData.destinationCommit,
          this.prData.sourceCommit,
          suggestion['body'] as string,
          suggestion['relevant_file'] as string,
          suggestion['relevant_lines_start'] as number,
        );
      } catch (e) {
        throw new Error(`CodeCommit Cannot publish code suggestion for PR: ${this.prNum}`);
      }
      counter++;
    }
    return true;
  }

  getFiles(): unknown[] {
    if (this.gitFiles) return this.gitFiles;
    this.gitFiles = [];
    return this.gitFiles;
  }

  getDiffFiles(): FilePatchInfo[] {
    if (this.diffFiles) return this.diffFiles;
    this.diffFiles = [];
    return this.diffFiles;
  }

  async publishComment(prComment: string, isTemporary: boolean = false): Promise<void> {
    if (isTemporary) {
      console.info(prComment);
      return;
    }

    if (!this.repoName || !this.prNum || !this.prData) return;

    prComment = prComment
      .replace(/<details>/g, '')
      .replace(/<\/details>/g, '')
      .replace(/<summary>/g, '')
      .replace(/<\/summary>/g, '');
    prComment = prComment.replace(/(?<!\n)\n(?!\n)/g, '\n\n');

    try {
      await this.codecommitClient.publishComment(
        this.repoName,
        this.prNum,
        this.prData.destinationCommit,
        this.prData.sourceCommit,
        prComment,
      );
    } catch (e) {
      throw new Error(`CodeCommit Cannot publish comment for PR: ${this.prNum}`);
    }
  }

  async removeInitialComment(): Promise<void> {
    // not implemented
  }

  async removeComment(_comment: unknown): Promise<void> {
    // not implemented
  }

  async publishInlineComment(_body: string, _relevantFile: string, _relevantLineInFile: string, _originalSuggestion?: Record<string, unknown>): Promise<void> {
    throw new Error('CodeCommit provider does not support publishing inline comments yet');
  }

  async publishInlineComments(_comments: Record<string, unknown>[]): Promise<void> {
    throw new Error('CodeCommit provider does not support publishing inline comments yet');
  }

  getTitle(): string {
    return this.prData?.title || '';
  }

  async getLanguages(): Promise<Record<string, number>> {
    const files = this.getFiles();
    const filenames = files.map((f: unknown) => (f as Record<string, unknown>)['filename'] as string || '');
    const extensions: string[] = [];
    for (const name of filenames) {
      const ext = name.split('.').pop()?.toLowerCase() || '';
      if (ext) extensions.push('.' + ext);
    }
    const total = extensions.length || 1;
    const counts: Record<string, number> = {};
    for (const ext of extensions) {
      counts[ext] = (counts[ext] || 0) + 1;
    }
    const percentages: Record<string, number> = {};
    for (const [ext, count] of Object.entries(counts)) {
      percentages[ext] = Math.round((count / total) * 100);
    }
    return percentages;
  }

  getPrBranch(): string {
    return this.prData?.sourceBranch || '';
  }

  async getPrDescriptionFull(): Promise<string> {
    return this.prData?.description || '';
  }

  async getUserId(): Promise<string | number | null> {
    return -1;
  }

  async getIssueComments(): Promise<unknown[]> {
    throw new Error('CodeCommit provider does not support issue comments yet');
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    if (!this.repoName || !this.prData) return null;
    try {
      const content = await this.codecommitClient.getFile(
        this.repoName,
        '.pr_agent.toml',
        this.prData.sourceCommit,
        true,
      );
      return content;
    } catch {
      return null;
    }
  }

  async addEyesReaction(_issueCommentId: number, _disableEyes?: boolean): Promise<number | null> {
    return null;
  }

  async removeReaction(_issueCommentId: number, _reactionId: number | string): Promise<boolean> {
    return true;
  }

  async getCommitMessages(): Promise<string> {
    return '';
  }

  getPrId(): string {
    try {
      return `${this.repoName}/${this.prNum}`;
    } catch {
      return '';
    }
  }

  static _parsePrUrl(prUrl: string): [string, number] {
    const parsedUrl = new URL(prUrl);

    if (!/^[a-z]{2}-(gov-)?[a-z]+-\d\.console\.aws\.amazon\.com$/.test(parsedUrl.hostname)) {
      throw new Error(`The provided URL is not a valid CodeCommit URL: ${prUrl}`);
    }

    const pathParts = parsedUrl.pathname.replace(/^\//, '').split('/');

    if (
      pathParts.length < 6 ||
      pathParts[0] !== 'codesuite' ||
      pathParts[1] !== 'codecommit' ||
      pathParts[2] !== 'repositories' ||
      pathParts[4] !== 'pull-requests'
    ) {
      throw new Error(`The provided URL does not appear to be a CodeCommit PR URL: ${prUrl}`);
    }

    const repoName = pathParts[3];
    const prNumber = parseInt(pathParts[5], 10);
    if (isNaN(prNumber)) throw new Error(`Unable to convert PR number to integer: '${pathParts[5]}'`);

    return [repoName, prNumber];
  }
}
