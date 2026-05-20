import { URL } from 'url';
import { GitProvider } from './gitProvider.js';
import { FilePatchInfo } from '@pr-agent/types';

export class AzureDevopsProvider extends GitProvider {
  private orgUrl: string;
  private pat: string;
  diffFiles: FilePatchInfo[] | null = null;
  workspaceSlug: string | null = null;
  repoSlug: string | null = null;
  prNum: number | null = null;
  prData: Record<string, unknown> | null = null;
  prUrl: string = '';
  tempComments: unknown[] = [];
  incremental: boolean;
  maxCommentChars = 65000;

  constructor(prUrl?: string, incremental: boolean = false) {
    super();
    this.orgUrl = process.env['AZURE_DEVOPS_ORG_URL'] || '';
    this.pat = process.env['AZURE_DEVOPS_PAT'] || '';
    this.incremental = incremental || false;

    if (!this.orgUrl) {
      throw new Error('Azure DevOps organization URL is required. Set AZURE_DEVOPS_ORG_URL.');
    }

    this.prUrl = prUrl || '';
    if (prUrl) {
      this.setPr(prUrl);
    }
  }

  private async _request<T>(method: string, path: string, body?: unknown, apiVersion: string = '7.1'): Promise<T> {
    const baseUrl = this.orgUrl.replace(/\/+$/, '');
    const url = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.pat) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`:${this.pat}`).toString('base64');
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}\n${errorBody}`);
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
  }

  isSupported(_capability: string): boolean {
    return true;
  }

  setPr(prUrl: string): void {
    this.prUrl = prUrl;
    const [workspaceSlug, repoSlug, prNum] = AzureDevopsProvider._parsePrUrl(prUrl);
    this.workspaceSlug = workspaceSlug;
    this.repoSlug = repoSlug;
    this.prNum = prNum;
    this.prData = {};
  }

  private async _fetchPrData(): Promise<void> {
    const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}`;
    this.prData = await this._request<Record<string, unknown>>('GET', path);
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/items?path=.pr_agent.toml&includeContent=true`;
      const response = await this._request<{ content?: string }>('GET', path);
      if (response?.content) return response.content;
      return null;
    } catch {
      return null;
    }
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}`;
    await this._request('PATCH', path, {
      title: prTitle,
      description: prBody.slice(0, 3999),
    });
  }

  async publishLabels(prTypes: string[]): Promise<void> {
    for (const prType of prTypes) {
      try {
        const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}/labels`;
        await this._request('POST', path, { name: prType });
      } catch (e) {
        console.warn('Failed to publish labels', { error: String(e) });
      }
    }
  }

  async getPrLabels(_update?: boolean): Promise<string[]> {
    try {
      const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}/labels`;
      const labels = await this._request<{ value?: { name?: string }[] }>('GET', path);
      return labels?.value?.map((l) => l.name || '') || [];
    } catch {
      return [];
    }
  }

  async getPrDescriptionFull(): Promise<string> {
    return (this.prData as Record<string, unknown>)?.['description'] as string || '';
  }

  async publishCodeSuggestions(codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    for (const suggestion of codeSuggestions) {
      const body = suggestion['body'] as string;
      const relevantFile = suggestion['relevant_file'] as string;
      const relevantLinesStart = suggestion['relevant_lines_start'] as number;
      const relevantLinesEnd = suggestion['relevant_lines_end'] as number;

      if (!relevantLinesStart || relevantLinesStart === -1) {
        console.warn('Failed to publish code suggestion, relevant_lines_start is', relevantLinesStart);
        continue;
      }

      if (relevantLinesEnd < relevantLinesStart) {
        console.warn(`Failed to publish code suggestion, end ${relevantLinesEnd} < start ${relevantLinesStart}`);
        continue;
      }

      const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}/threads`;
      const threadContext = {
        filePath: relevantFile,
        rightFileStart: { line: relevantLinesStart, offset: 1 },
        rightFileEnd: { line: relevantLinesEnd, offset: 1 },
      };

      try {
        await this._request('POST', path, {
          comments: [{ content: body, commentType: 1 }],
          threadContext,
          status: process.env['AZURE_DEVOPS_DEFAULT_COMMENT_STATUS'] || 'closed',
        });
      } catch (e) {
        console.error('Azure failed to publish code suggestion', { error: String(e), suggestion });
      }
    }
    return true;
  }

  getFiles(): string[] {
    return [];
  }

  getDiffFiles(): FilePatchInfo[] {
    if (this.diffFiles) return this.diffFiles;
    this.diffFiles = [];
    return this.diffFiles;
  }

  async publishComment(prComment: string, isTemporary: boolean = false): Promise<unknown> {
    if (isTemporary && process.env['PUBLISH_OUTPUT_PROGRESS'] !== 'true') {
      return null;
    }
    prComment = this.limitOutputCharacters(prComment, this.maxCommentChars);
    const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}/threads`;
    const thread = await this._request<{ id?: number; comments?: { id?: number }[] }>('POST', path, {
      comments: [{ content: prComment, commentType: 1 }],
      status: 'closed',
    });
    const comment = thread.comments?.[0] || {};
    (comment as Record<string, unknown>).thread_id = thread.id;
    if (isTemporary) {
      this.tempComments.push(comment);
    }
    return comment;
  }

  async publishPersistentComment(
    prComment: string,
    initialHeader: string,
    updateHeader: boolean = true,
    name: string = 'review',
    finalUpdateMessage: boolean = true,
  ): Promise<unknown> {
    return this.publishPersistentCommentFull(prComment, initialHeader, updateHeader, name, finalUpdateMessage);
  }

  async editComment(_comment: unknown, body: string): Promise<void> {
    try {
      body = this.limitOutputCharacters(body, this.maxCommentChars);
    } catch (e) {
      console.error('Failed to edit comment', { error: String(e) });
    }
  }

  async removeInitialComment(): Promise<void> {
    for (const comment of this.tempComments) {
      await this.removeComment(comment);
    }
  }

  async removeComment(_comment: unknown): Promise<void> {
    // not implemented
  }

  async publishInlineComment(
    body: string,
    relevantFile: string,
    relevantLineInFile: string,
    _originalSuggestion?: Record<string, unknown>,
  ): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    await this.publishInlineComments([this.createInlineComment(body, relevantFile, relevantLineInFile)]);
  }

  createInlineComment(
    body: string,
    _relevantFile: string,
    _relevantLineInFile: string,
    absolutePosition?: number,
  ): Record<string, unknown> {
    return { body, path: '', position: absolutePosition || 1, absolute_position: absolutePosition || 1 };
  }

  async publishInlineComments(comments: Record<string, unknown>[], _disableFallback: boolean = false): Promise<void> {
    for (const comment of comments) {
      try {
        await this.publishComment(comment['body'] as string, false);
      } catch (e) {
        console.error('Failed to publish code suggestion', { error: String(e) });
      }
    }
  }

  getTitle(): string {
    return (this.prData as Record<string, unknown>)?.['title'] as string || '';
  }

  async getLanguages(): Promise<Record<string, number>> {
    return {};
  }

  getPrBranch(): string {
    return (this.prData as Record<string, unknown>)?.['sourceRefName']?.toString()?.split('/')?.pop() || '';
  }

  async getUserId(): Promise<string | number | null> {
    return 0;
  }

  async getIssueComments(): Promise<unknown[]> {
    try {
      const path = `/${this.workspaceSlug}/_apis/git/repositories/${this.repoSlug}/pullRequests/${this.prNum}/threads`;
      const threads = await this._request<{ value?: { id?: number; comments?: { content?: string }[] }[] }>('GET', path);
      const comments: unknown[] = [];
      for (const thread of threads?.value || []) {
        for (const comment of thread.comments || []) {
          if (comment.content) {
            comments.push(comment);
          }
        }
      }
      return comments.reverse();
    } catch (e) {
      console.error('Failed to get issue comments', { error: String(e) });
      return [];
    }
  }

  async addEyesReaction(_issueCommentId: number, _disableEyes: boolean = false): Promise<number | null> {
    return null;
  }

  async removeReaction(_issueCommentId: number, _reactionId: number | string): Promise<boolean> {
    return true;
  }

  async getCommitMessages(): Promise<string> {
    return '';
  }

  getLineLink(relevantFile: string, _relevantLineStart: number, _relevantLineEnd?: number): string {
    return `${this.prUrl}?_a=files&path=${relevantFile}`;
  }

  getCommentUrl(_comment: unknown): string {
    return '';
  }

  getLatestCommitUrl(): string {
    return '';
  }

  getPrId(): string {
    try {
      return `${this.workspaceSlug}/${this.repoSlug}/${this.prNum}`;
    } catch {
      return '';
    }
  }

  async publishFileComments(_fileComments: Record<string, unknown>[]): Promise<boolean> {
    return false;
  }

  static _parsePrUrl(prUrl: string): [string, string, number] {
    const parsedUrl = new URL(prUrl);
    const pathParts = parsedUrl.pathname.replace(/^\//, '').split('/');
    const numParts = pathParts.length;

    if (numParts < 5) {
      throw new Error('The provided URL has insufficient path components for an Azure DevOps PR URL');
    }

    if (pathParts[numParts - 2] !== 'pullrequest') {
      throw new Error('The provided URL does not follow the expected Azure DevOps PR URL format');
    }

    const workspaceSlug = pathParts[numParts - 5];
    const repoSlug = pathParts[numParts - 3];
    const prNumber = parseInt(pathParts[numParts - 1], 10);
    if (isNaN(prNumber)) throw new Error('Cannot parse PR number in the provided URL');

    return [workspaceSlug, repoSlug, prNumber];
  }

  protected _prepareCloneUrlWithToken(_repoUrlToClone: string): string | null {
    return null;
  }
}
