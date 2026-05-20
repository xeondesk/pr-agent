import { URL } from 'url';
import { GitProvider } from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo } from '@pr-agent/types';

export class BitbucketServerProvider extends GitProvider {
  bitbucketServerUrl: string | null = null;
  workspaceSlug: string | null = null;
  repoSlug: string | null = null;
  prNum: number | null = null;
  pr: Record<string, unknown> | null = null;
  prUrl: string;
  tempComments: unknown[] = [];
  incremental: boolean;
  diffFiles: FilePatchInfo[] | null = null;
  bitbucketPullRequestApiUrl: string;
  bearerToken: string | null;
  username: string | null;
  password: string | null;
  private _authHeader: string;

  constructor(prUrl?: string, incremental: boolean = false) {
    super();
    this.bearerToken = process.env['BITBUCKET_SERVER_BEARER_TOKEN'] || null;
    this.username = process.env['BITBUCKET_SERVER_USERNAME'] || null;
    this.password = process.env['BITBUCKET_SERVER_PASSWORD'] || null;
    this.prUrl = prUrl || '';
    this.bitbucketPullRequestApiUrl = this.prUrl;
    this.incremental = incremental;

    if (prUrl) {
      this.bitbucketServerUrl = BitbucketServerProvider._parseBitbucketServer(prUrl);
      if (!this.bitbucketServerUrl) {
        throw new Error('Invalid or missing Bitbucket Server URL parsed from PR URL.');
      }
      this.setPr(prUrl);
    }

    if (this.bearerToken) {
      this._authHeader = `Bearer ${this.bearerToken}`;
    } else if (this.username && this.password) {
      this._authHeader = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
    } else {
      throw new Error('Bitbucket Server requires either bearer token or username/password');
    }
  }

  private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const base = this.bitbucketServerUrl!.replace(/\/+$/, '');
    const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers: Record<string, string> = {
      Authorization: this._authHeader,
      'Content-Type': 'application/json',
    };
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Bitbucket Server API error: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
  }

  isSupported(capability: string): boolean {
    if (['get_issue_comments', 'get_labels', 'gfm_markdown', 'publish_file_comments'].includes(capability)) {
      return false;
    }
    return true;
  }

  setPr(prUrl: string): void {
    const [workspaceSlug, repoSlug, prNum] = BitbucketServerProvider._parsePrUrl(prUrl);
    this.workspaceSlug = workspaceSlug;
    this.repoSlug = repoSlug;
    this.prNum = prNum;
    this.pr = {};
  }

  private async _fetchPrData(): Promise<void> {
    try {
      const path = `/rest/api/latest/projects/${encodeURIComponent(this.workspaceSlug!)}/repos/${encodeURIComponent(this.repoSlug!)}/pull-requests/${this.prNum}`;
      this.pr = await this._request<Record<string, unknown>>('GET', path);
    } catch (e) {
      console.error('Failed to fetch PR data', { error: String(e) });
    }
  }

  getGitRepoUrl(_issuesOrPrUrl?: string): string {
    return `${this.bitbucketServerUrl}/scm/${this.workspaceSlug!.toLowerCase()}/${this.repoSlug!.toLowerCase()}.git`;
  }

  getCanonicalUrlParts(repoGitUrl?: string, desiredBranch?: string): [string, string] {
    if (!this.workspaceSlug || !this.repoSlug) {
      console.error('workspace_name or project_name not found');
      return ['', ''];
    }
    const prefix = `${this.bitbucketServerUrl}/projects/${this.workspaceSlug}/repos/${this.repoSlug}/browse`;
    const suffix = `?at=refs%2Fheads%2F${desiredBranch || 'main'}`;
    return [prefix, suffix];
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      const path = `/rest/api/latest/projects/${encodeURIComponent(this.workspaceSlug!)}/repos/${encodeURIComponent(this.repoSlug!)}/raw/.pr_agent.toml?at=refs%2Fheads%2Fmain`;
      const content = await this._request<string>('GET', path);
      return content;
    } catch (e) {
      const err = e as unknown as Record<string, unknown>;
      if (err['status'] === 404) return null;
      console.error('Failed to load .pr_agent.toml', { error: String(e) });
      return null;
    }
  }

  getPrId(): string {
    return this.prNum?.toString() || '';
  }

  async publishDescription(prTitle: string, description: string): Promise<void> {
    const payload: Record<string, unknown> = {
      version: 1,
      description,
      title: prTitle,
      reviewers: [],
    };
    const path = `/rest/api/latest/projects/${encodeURIComponent(this.workspaceSlug!)}/repos/${encodeURIComponent(this.repoSlug!)}/pull-requests/${this.prNum}`;
    try {
      await this._request('PUT', path, payload);
    } catch (e) {
      console.error('Failed to update pull request', { error: String(e) });
    }
  }

  async publishLabels(_labels: string[]): Promise<void> {
    // not supported
  }

  async getPrLabels(_update?: boolean): Promise<string[]> {
    return [];
  }

  async publishCodeSuggestions(codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    const postParametersList: Record<string, unknown>[] = [];

    for (const suggestion of codeSuggestions) {
      const body = suggestion['body'] as string;
      const relevantFile = suggestion['relevant_file'] as string;
      const relevantLinesStart = suggestion['relevant_lines_start'] as number;
      const relevantLinesEnd = suggestion['relevant_lines_end'] as number;

      if (!relevantLinesStart || relevantLinesStart === -1) {
        console.warn(`Failed to publish code suggestion, relevant_lines_start is ${relevantLinesStart}`);
        continue;
      }

      if (relevantLinesEnd < relevantLinesStart) {
        console.warn(`Failed to publish code suggestion, relevant_lines_end ${relevantLinesEnd} < start ${relevantLinesStart}`);
        continue;
      }

      if (relevantLinesEnd > relevantLinesStart) {
        postParametersList.push({
          body: body.replace('```suggestion', '```'),
          path: relevantFile,
          line: relevantLinesEnd,
          start_line: relevantLinesStart,
          start_side: 'RIGHT',
        });
      } else {
        postParametersList.push({
          body,
          path: relevantFile,
          line: relevantLinesStart,
          side: 'RIGHT',
        });
      }
    }

    try {
      await this.publishInlineComments(postParametersList);
      return true;
    } catch (e) {
      console.error('Failed to publish code suggestion', { error: String(e) });
      return false;
    }
  }

  async publishFileComments(_fileComments: Record<string, unknown>[]): Promise<boolean> {
    return false;
  }

  getFiles(): string[] {
    return [];
  }

  getDiffFiles(): FilePatchInfo[] {
    if (this.diffFiles) return this.diffFiles;
    this.diffFiles = [];
    return this.diffFiles;
  }

  async publishComment(mrComment: string, isTemporary: boolean = false): Promise<unknown> {
    if (isTemporary) return null;
    const path = `/rest/api/latest/projects/${encodeURIComponent(this.workspaceSlug!)}/repos/${encodeURIComponent(this.repoSlug!)}/pull-requests/${this.prNum}/comments`;
    return this._request('POST', path, { text: mrComment });
  }

  async removeInitialComment(): Promise<void> {
    for (const comment of this.tempComments) {
      await this.removeComment(comment);
    }
  }

  async removeComment(_comment: unknown): Promise<void> {
    // not implemented
  }

  createInlineComment(
    body: string,
    relevantFile: string,
    _relevantLineInFile: string,
    absolutePosition?: number,
  ): Record<string, unknown> {
    return { body, path: relevantFile.trim(), position: absolutePosition || 1 };
  }

  async publishInlineComment(
    body: string,
    relevantFile: string,
    _relevantLineInFile: string,
    _originalSuggestion?: Record<string, unknown>,
  ): Promise<void> {
    const payload = {
      text: body,
      severity: 'NORMAL',
      anchor: {
        diffType: 'EFFECTIVE',
        path: relevantFile,
        lineType: 'ADDED',
        line: 1,
        fileType: 'TO',
      },
    };
    const path = this._getPrCommentsPath();
    await this._request('POST', path, payload);
  }

  async publishInlineComments(comments: Record<string, unknown>[]): Promise<void> {
    for (const comment of comments) {
      const body = comment['body'] as string;
      const path = comment['path'] as string;
      await this.publishInlineComment(body, path, '');
    }
  }

  getTitle(): string {
    return (this.pr as Record<string, unknown>)?.['title'] as string || '';
  }

  async getLanguages(): Promise<Record<string, number>> {
    return { yaml: 0 };
  }

  getPrBranch(): string {
    const pr = this.pr as Record<string, unknown> | null;
    const fromRef = pr?.['fromRef'] as Record<string, unknown> | undefined;
    return (fromRef?.['displayId'] as string) || '';
  }

  async getPrDescriptionFull(): Promise<string> {
    return (this.pr as Record<string, unknown>)?.['description'] as string || '';
  }

  async getUserId(): Promise<string | number | null> {
    return 0;
  }

  async getIssueComments(): Promise<unknown[]> {
    throw new Error('Bitbucket Server provider does not support issue comments yet');
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

  getLineLink(relevantFile: string, relevantLineStart: number, _relevantLineEnd?: number): string {
    if (relevantLineStart === -1) {
      return `${this.prUrl}/diff#${encodeURIComponent(relevantFile)}`;
    }
    return `${this.prUrl}/diff#${encodeURIComponent(relevantFile)}?t=${relevantLineStart}`;
  }

  getCommentUrl(_comment: unknown): string {
    return '';
  }

  getLatestCommitUrl(): string {
    return '';
  }

  private _getPrCommentsPath(): string {
    return `/rest/api/latest/projects/${encodeURIComponent(this.workspaceSlug!)}/repos/${encodeURIComponent(this.repoSlug!)}/pull-requests/${this.prNum}/comments`;
  }

  static _parseBitbucketServer(url: string): string | null {
    const parsedUrl = new URL(url);
    const serverPath = parsedUrl.pathname.split('/projects/');
    if (serverPath.length > 1) {
      const path = serverPath[0].replace(/\/$/, '');
      return `${parsedUrl.protocol}//${parsedUrl.host}${path}`;
    }
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  }

  static _parsePrUrl(prUrl: string): [string, string, number] {
    const parsedUrl = new URL(prUrl);
    const pathParts = parsedUrl.pathname.replace(/^\//, '').split('/');
    const projectsIndex = pathParts.indexOf('projects');
    const usersIndex = pathParts.indexOf('users');

    if (projectsIndex === -1 && usersIndex === -1) {
      throw new Error(`The provided URL '${prUrl}' does not appear to be a Bitbucket PR URL`);
    }

    const relevantParts = projectsIndex !== -1 ? pathParts.slice(projectsIndex) : pathParts.slice(usersIndex);

    if (relevantParts.length < 6 || relevantParts[2] !== 'repos' || relevantParts[4] !== 'pull-requests') {
      throw new Error(`The provided URL '${prUrl}' does not appear to be a Bitbucket PR URL`);
    }

    let workspaceSlug = relevantParts[1];
    if (usersIndex !== -1) {
      workspaceSlug = `~${workspaceSlug}`;
    }
    const repoSlug = relevantParts[3];
    const prNumber = parseInt(relevantParts[5], 10);
    if (isNaN(prNumber)) throw new Error('Unable to convert PR number to integer');

    return [workspaceSlug, repoSlug, prNumber];
  }

  protected _prepareCloneUrlWithToken(repoUrlToClone: string): string | null {
    if (!repoUrlToClone.includes('bitbucket.')) {
      console.error('Repo URL is not a valid bitbucket URL.');
      return null;
    }
    if (!this.bearerToken) {
      console.error('No bearer token provided.');
      return null;
    }
    return repoUrlToClone;
  }
}
