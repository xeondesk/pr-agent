import { URL } from 'url';
import { GitProvider } from './gitProvider.js';
import { FilePatchInfo } from '@pr-agent/types';

export class BitbucketProvider extends GitProvider {
  private authType: string;
  private bearerToken: string | null = null;
  private basicToken: string | null = null;
  private headers: Record<string, string>;
  maxCommentLength = 31000;
  workspaceSlug: string | null = null;
  repoSlug: string | null = null;
  repo: Record<string, unknown> | null = null;
  prNum: number | null = null;
  prData: Record<string, unknown> | null = null;
  prUrl: string;
  tempComments: unknown[] = [];
  incremental: boolean;
  diffFiles: FilePatchInfo[] | null = null;
  gitFiles: string[] | null = null;
  bitbucketCommentApiUrl: string = '';
  bitbucketPullRequestApiUrl: string = '';

  constructor(prUrl?: string, incremental: boolean = false) {
    super();
    this.authType = process.env['BITBUCKET_AUTH_TYPE'] || 'bearer';
    this.headers = { 'Content-Type': 'application/json' };

    if (this.authType === 'basic') {
      this.basicToken = process.env['BITBUCKET_BASIC_TOKEN'] || '';
      if (!this.basicToken) throw new Error('Basic auth requires a token');
      this.headers['Authorization'] = `Basic ${this.basicToken}`;
    } else if (this.authType === 'bearer') {
      this.bearerToken = process.env['BITBUCKET_BEARER_TOKEN'] || '';
      if (!this.bearerToken) throw new Error('Bearer auth requires a token');
      this.headers['Authorization'] = `Bearer ${this.bearerToken}`;
    } else {
      throw new Error(`Unsupported auth_type: ${this.authType}`);
    }

    this.prUrl = prUrl || '';
    this.incremental = incremental;

    if (prUrl) {
      this.setPr(prUrl);
    }
  }

  private async _request<T>(method: string, pathOrUrl: string, body?: unknown, useFullUrl: boolean = false): Promise<T> {
    const url = useFullUrl ? pathOrUrl : `https://api.bitbucket.org/2.0${pathOrUrl}`;
    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const err = new Error(`Bitbucket API error: ${response.status} ${response.statusText}`);
      (err as unknown as Record<string, unknown>).status = response.status;
      (err as unknown as Record<string, unknown>).body = errorBody;
      throw err;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
  }

  isSupported(capability: string): boolean {
    if (['get_issue_comments', 'publish_inline_comments', 'get_labels', 'gfm_markdown', 'publish_file_comments'].includes(capability)) {
      return false;
    }
    return true;
  }

  setPr(prUrl: string): void {
    const [workspaceSlug, repoSlug, prNum] = BitbucketProvider._parsePrUrl(prUrl);
    this.workspaceSlug = workspaceSlug;
    this.repoSlug = repoSlug;
    this.prNum = prNum;
    this.prData = {};
  }

  private async _fetchPrData(): Promise<void> {
    const path = `/repositories/${this.workspaceSlug}/${this.repoSlug}/pullrequests/${this.prNum}`;
    this.prData = await this._request<Record<string, unknown>>('GET', path);
    const links = this.prData!['links'] as Record<string, Record<string, string>>;
    this.bitbucketCommentApiUrl = links?.comments?.href || '';
    this.bitbucketPullRequestApiUrl = links?.self?.href || '';
  }

  getGitRepoUrl(_issuesOrPrUrl?: string): string {
    return `https://bitbucket.org/${this.workspaceSlug}/${this.repoSlug}.git`;
  }

  getCanonicalUrlParts(repoGitUrl?: string, desiredBranch?: string): [string, string] {
    let workspaceName: string;
    let projectName: string;
    let schemeAndNetloc: string;

    if (repoGitUrl) {
      const parsedUrl = new URL(repoGitUrl);
      schemeAndNetloc = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
      const repoPath = parsedUrl.pathname.replace('.git', '').replace(/^\//, '');
      const parts = repoPath.split('/');
      if (parts.length !== 2) {
        console.error(`repo_git_url is not valid: ${repoGitUrl}`);
        return ['', ''];
      }
      workspaceName = parts[0];
      projectName = parts[1];
    } else {
      const parsedPrUrl = new URL(this.prUrl);
      schemeAndNetloc = `${parsedPrUrl.protocol}//${parsedPrUrl.hostname}`;
      workspaceName = this.workspaceSlug!;
      projectName = this.repoSlug!;
    }

    const prefix = `${schemeAndNetloc}/${workspaceName}/${projectName}/src/${desiredBranch || 'main'}`;
    return [prefix, ''];
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      const branch = this.getRepoDefaultBranch();
      const url = `https://api.bitbucket.org/2.0/repositories/${this.workspaceSlug}/${this.repoSlug}/src/${branch}/.pr_agent.toml`;
      const response = await fetch(url, { headers: this.headers });
      if (response.status === 404) return null;
      const text = await response.text();
      return new TextEncoder().encode(text);
    } catch {
      return null;
    }
  }

  private getRepoDefaultBranch(): string {
    return 'main';
  }

  async publishDescription(_prTitle: string, _prBody: string): Promise<void> {
    // not fully implemented
  }

  async publishLabels(_labels: string[]): Promise<void> {
    // bitbucket does not support labels
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
        console.error(`Failed to publish code suggestion, relevant_lines_start is ${relevantLinesStart}`);
        continue;
      }

      if (relevantLinesEnd < relevantLinesStart) {
        console.error(`Failed to publish code suggestion, relevant_lines_end ${relevantLinesEnd} < start ${relevantLinesStart}`);
        continue;
      }

      if (relevantLinesEnd > relevantLinesStart) {
        postParametersList.push({
          body,
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
      console.error('Bitbucket failed to publish code suggestion', { error: String(e) });
      return false;
    }
  }

  async publishFileComments(_fileComments: Record<string, unknown>[]): Promise<boolean> {
    return false;
  }

  getFiles(): string[] {
    return this.gitFiles || [];
  }

  getDiffFiles(): FilePatchInfo[] {
    if (this.diffFiles) return this.diffFiles;
    this.diffFiles = [];
    return this.diffFiles;
  }

  getLatestCommitUrl(): string {
    return '';
  }

  getCommentUrl(_comment: unknown): string {
    return '';
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

  async publishComment(prComment: string, isTemporary: boolean = false): Promise<unknown> {
    if (isTemporary && process.env['PUBLISH_OUTPUT_PROGRESS'] !== 'true') {
      return null;
    }
    prComment = this.limitOutputCharacters(prComment, this.maxCommentLength);
    const path = `/repositories/${this.workspaceSlug}/${this.repoSlug}/pullrequests/${this.prNum}/comments`;
    const comment = await this._request<Record<string, unknown>>('POST', path, { content: { raw: prComment } });
    if (isTemporary) {
      this.tempComments.push(comment['id']);
    }
    return comment;
  }

  async editComment(_comment: unknown, body: string): Promise<void> {
    try {
      body = this.limitOutputCharacters(body, this.maxCommentLength);
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

  createInlineComment(
    body: string,
    relevantFile: string,
    _relevantLineInFile: string,
    absolutePosition?: number,
  ): Record<string, unknown> {
    body = this.limitOutputCharacters(body, this.maxCommentLength);
    return { body, path: relevantFile.trim(), position: absolutePosition || 1 };
  }

  async publishInlineComment(
    body: string,
    relevantFile: string,
    _relevantLineInFile: string,
    _originalSuggestion?: Record<string, unknown>,
  ): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentLength);
    const payload = {
      content: { raw: body },
      inline: { to: 1, path: relevantFile },
    };
    await this._request('POST', this.bitbucketCommentApiUrl, payload, true);
  }

  async publishInlineComments(comments: Record<string, unknown>[]): Promise<void> {
    for (const comment of comments) {
      const body = comment['body'] as string;
      const path = comment['path'] as string;
      await this.publishInlineComment(body, path, '');
    }
  }

  getTitle(): string {
    return (this.prData as Record<string, unknown>)?.['title'] as string || '';
  }

  async getLanguages(): Promise<Record<string, number>> {
    return { unknown: 0 };
  }

  getPrBranch(): string {
    return '';
  }

  async getPrDescriptionFull(): Promise<string> {
    return (this.prData as Record<string, unknown>)?.['description'] as string || '';
  }

  async getUserId(): Promise<string | number | null> {
    return 0;
  }

  async getIssueComments(): Promise<unknown[]> {
    throw new Error('Bitbucket provider does not support issue comments yet');
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
      return `${this.prUrl}/#L${relevantFile}`;
    }
    return `${this.prUrl}/#L${relevantFile}T${relevantLineStart}`;
  }

  getPrId(): string {
    try {
      return `${this.workspaceSlug}/${this.repoSlug}/${this.prNum}`;
    } catch {
      return '';
    }
  }

  static _parsePrUrl(prUrl: string): [string, string, number] {
    const parsedUrl = new URL(prUrl);
    if (!parsedUrl.hostname.includes('bitbucket.org')) {
      throw new Error('The provided URL is not a valid Bitbucket URL');
    }
    const pathParts = parsedUrl.pathname.replace(/^\//, '').split('/');
    if (pathParts.length < 4 || pathParts[2] !== 'pull-requests') {
      throw new Error('The provided URL does not appear to be a Bitbucket PR URL');
    }
    const workspaceSlug = pathParts[0];
    const repoSlug = pathParts[1];
    const prNumber = parseInt(pathParts[3], 10);
    if (isNaN(prNumber)) throw new Error('Unable to convert PR number to integer');
    return [workspaceSlug, repoSlug, prNumber];
  }

  protected _prepareCloneUrlWithToken(repoUrlToClone: string): string | null {
    if (!repoUrlToClone.includes('bitbucket.org')) {
      console.error('Repo URL is not a valid bitbucket URL.');
      return null;
    }
    const [scheme, baseUrl] = repoUrlToClone.split('bitbucket.org');
    if (!scheme || !baseUrl) {
      console.error(`repo_url_to_clone: ${repoUrlToClone} is not a valid bitbucket URL.`);
      return null;
    }
    const token = this.authType === 'basic' ? this.basicToken : this.bearerToken;
    return `${scheme}x-token-auth:${token}@bitbucket.org${baseUrl}`;
  }
}
