import { URL } from 'url';
import { GitProvider, IncrementalPR } from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo } from '@pr-agent/types';

export class GiteaProvider extends GitProvider {
  baseUrl: string;
  prUrl: string = '';
  issueUrl: string = '';
  private accessToken: string;
  owner: string | null = null;
  repo: string | null = null;
  prNumber: number | null = null;
  issueNumber: number | null = null;
  maxCommentChars = 65000;
  enabledPr = false;
  enabledIssue = false;
  tempComments: unknown[] = [];
  prData: Record<string, unknown> | null = null;
  gitFiles: { filename?: string; additions?: number; deletions?: number; status?: string }[] = [];
  fileContents: Record<string, string> = {};
  fileDiffs: Record<string, string> = {};
  sha: string = '';
  diffFiles: FilePatchInfo[] = [];
  incremental = new IncrementalPR(false);
  commentsList: Record<string, unknown>[] = [];
  unreviewedFilesSet: Record<string, unknown> = {};
  lastCommit: Record<string, unknown> | null = null;
  lastCommitId: Record<string, unknown> | null = null;
  baseSha: string = '';
  baseRef: string = '';

  constructor(url?: string) {
    super();
    this.baseUrl = (process.env['GITEA_URL'] || 'https://gitea.com').replace(/\/+$/, '');
    this.accessToken = process.env['GITEA_PERSONAL_ACCESS_TOKEN'] || '';
    if (!this.accessToken) {
      throw new Error('Gitea access token not found. Set GITEA_PERSONAL_ACCESS_TOKEN.');
    }

    if (url) {
      if (url.includes('pulls')) {
        this.prUrl = url;
        this.__setRepoAndOwnerFromPr();
        this.enabledPr = true;
        this.prData = {};
      } else if (url.includes('issues')) {
        this.issueUrl = url;
        this.__setRepoAndOwnerFromIssue();
        this.enabledIssue = true;
      }
    }
  }

  private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `token ${this.accessToken}`,
    };
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Gitea API error: ${response.status} ${response.statusText}\n${errorBody}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
  }

  private async _requestRaw(method: string, path: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `token ${this.accessToken}`,
    };
    const response = await fetch(url, { method, headers });
    if (!response.ok) {
      throw new Error(`Gitea API error: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  isSupported(_capability: string): boolean {
    return true;
  }

  private __setRepoAndOwnerFromPr(): void {
    try {
      const [owner, repo, prNumber] = GiteaProvider._parsePrUrl(this.prUrl);
      this.owner = owner;
      this.repo = repo;
      this.prNumber = prNumber;
    } catch (e) {
      console.error('Error parsing PR URL', { error: String(e) });
    }
  }

  private __setRepoAndOwnerFromIssue(): void {
    try {
      const [owner, repo, issueNumber] = GiteaProvider._parseIssueUrl(this.issueUrl);
      this.owner = owner;
      this.repo = repo;
      this.issueNumber = issueNumber;
    } catch (e) {
      console.error('Error parsing issue URL', { error: String(e) });
    }
  }

  setPr(prUrl: string): void {
    if (prUrl.includes('pulls')) {
      this.prUrl = prUrl;
      this.__setRepoAndOwnerFromPr();
      this.enabledPr = true;
    }
  }

  getLatestCommitUrl(): string {
    return (this.lastCommit as Record<string, unknown>)?.['html_url'] as string || '';
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

  async publishComment(comment: string, isTemporary: boolean = false): Promise<unknown> {
    if (isTemporary && process.env['PUBLISH_OUTPUT_PROGRESS'] !== 'true') {
      return null;
    }

    const index = this.enabledIssue ? this.issueNumber : this.prNumber;
    if (!index || !this.owner || !this.repo) {
      console.error('Neither PR nor issue URL provided.');
      return null;
    }

    comment = this.limitOutputCharacters(comment, this.maxCommentChars);
    const result = await this._request<Record<string, unknown>>(
      'POST',
      `/repos/${this.owner}/${this.repo}/issues/${index}/comments`,
      { body: comment },
    );

    if (!result) {
      console.error('Failed to publish comment');
      return null;
    }

    const commentObj: Record<string, unknown> = {
      is_temporary: isTemporary,
      comment,
      comment_id: result['id'],
    };
    this.commentsList.push(commentObj);
    return commentObj;
  }

  async editComment(comment: Record<string, unknown>, body: string): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    try {
      const commentId = (typeof comment === 'object' ? comment['comment_id'] : (comment as Record<string, unknown>)['id']) as number;
      await this._request(
        'PATCH',
        `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`,
        { body },
      );
    } catch (e) {
      console.error('Error editing comment', { error: String(e) });
    }
  }

  async publishInlineComment(
    body: string,
    relevantFile: string,
    _relevantLineInFile: string,
    _originalSuggestion?: Record<string, unknown>,
  ): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    const payload = { body, path: relevantFile.trim(), old_position: 0, new_position: 1 };
    await this.publishInlineComments([payload]);
  }

  async publishInlineComments(comments: Record<string, unknown>[], _body?: string): Promise<void> {
    const prNumber = this.enabledPr ? this.prNumber : this.issueNumber;
    if (!prNumber || !this.owner || !this.repo) return;

    const commitId = (this.lastCommit as Record<string, unknown>)?.['sha'] || '';
    await this._request(
      'POST',
      `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/reviews`,
      {
        body: _body || 'Inline comment',
        comments,
        commit_id: commitId,
      },
    );
  }

  async publishCodeSuggestions(suggestions: Record<string, unknown>[]): Promise<boolean> {
    for (const suggestion of suggestions) {
      const body = suggestion['body'] as string;
      if (!body) {
        console.error('No body provided for the suggestion');
        continue;
      }
      const path = suggestion['relevant_file'] as string;
      const newPosition = suggestion['relevant_lines_start'] as number;
      const payload = { body, path, old_position: newPosition, new_position: newPosition };
      await this.publishInlineComments([payload]);
    }
    return true;
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    const prNumber = this.enabledPr ? this.prNumber : this.issueNumber;
    if (!prNumber) return;
    await this._request(
      'PATCH',
      `/repos/${this.owner}/${this.repo}/pulls/${prNumber}`,
      { title: prTitle, body: prBody },
    );
  }

  async publishLabels(labels: string[]): Promise<void> {
    if (!labels.length) return;
    const issueNumber = this.enabledPr ? this.prNumber : this.issueNumber;
    if (!issueNumber) return;
    await this._request(
      'POST',
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`,
      { labels },
    );
  }

  async getPrLabels(_update?: boolean): Promise<string[]> {
    const labels = (this.prData as Record<string, unknown>)?.['labels'] as { name?: string }[];
    return labels?.map((l) => l.name || '') || [];
  }

  getFiles(): { filename?: string }[] {
    return this.gitFiles;
  }

  getDiffFiles(): FilePatchInfo[] {
    if (this.diffFiles && this.diffFiles.length > 0) return this.diffFiles;

    const diffFiles: FilePatchInfo[] = [];
    for (const file of this.gitFiles) {
      const filename = file.filename || '';
      const patch = this.fileDiffs[filename] || '';
      let editType = EDIT_TYPE.UNKNOWN;
      switch (file.status) {
        case 'added': editType = EDIT_TYPE.ADDED; break;
        case 'removed':
        case 'deleted': editType = EDIT_TYPE.DELETED; break;
        case 'renamed': editType = EDIT_TYPE.RENAMED; break;
        case 'modified':
        case 'changed': editType = EDIT_TYPE.MODIFIED; break;
      }
      diffFiles.push({
        base_file: '',
        head_file: this.fileContents[filename] || '',
        patch,
        filename,
        num_plus_lines: file.additions || 0,
        num_minus_lines: file.deletions || 0,
        edit_type: editType,
      });
    }
    this.diffFiles = diffFiles;
    return diffFiles;
  }

  async getIssueComments(): Promise<unknown[]> {
    const index = this.enabledIssue ? this.issueNumber : this.prNumber;
    if (!index) return [];
    return this._request('GET', `/repos/${this.owner}/${this.repo}/issues/${index}/comments`);
  }

  async getLanguages(): Promise<Record<string, number>> {
    return this._request('GET', `/repos/${this.owner}/${this.repo}/languages`);
  }

  getPrBranch(): string {
    const head = (this.prData as Record<string, unknown> | null)?.['head'] as Record<string, unknown> | undefined;
    return (head?.['ref'] as string) || '';
  }

  async getPrDescriptionFull(): Promise<string> {
    return (this.prData as Record<string, unknown>)?.['body'] as string || '';
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      const content = await this._requestRaw('GET', `/repos/${this.owner}/${this.repo}/raw/.pr_agent.toml?ref=${this.sha || 'main'}`);
      return content;
    } catch {
      return null;
    }
  }

  async getUserId(): Promise<string | null> {
    const user = (this.prData as Record<string, unknown> | null)?.['user'] as Record<string, unknown> | undefined;
    return user?.['id']?.toString() || null;
  }

  async removeInitialComment(): Promise<void> {
    for (const comment of this.commentsList) {
      if (!comment['is_temporary']) continue;
      await this.removeComment(comment);
    }
  }

  async removeComment(comment: Record<string, unknown>): Promise<void> {
    try {
      const commentId = comment['comment_id'] as number || (comment['id'] as number);
      if (!commentId) return;
      await this._request('DELETE', `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`);
      const idx = this.commentsList.indexOf(comment);
      if (idx !== -1) this.commentsList.splice(idx, 1);
    } catch (e) {
      console.error('Error removing comment', { error: String(e) });
    }
  }

  async addEyesReaction(issueCommentId: number, disableEyes: boolean = false): Promise<number | null> {
    if (disableEyes) return null;
    try {
      const result = await this._request<Record<string, unknown>>(
        'POST',
        `/repos/${this.owner}/${this.repo}/issues/comments/${issueCommentId}/reactions`,
        { content: 'eyes' },
      );
      return (result['id'] as number) || null;
    } catch (e) {
      console.error('Error adding eyes reaction', { error: String(e) });
      return null;
    }
  }

  async removeReaction(issueCommentId: number, _reactionId: number | string): Promise<boolean> {
    try {
      await this._request('DELETE', `/repos/${this.owner}/${this.repo}/issues/comments/${issueCommentId}/reactions`);
      return true;
    } catch (e) {
      console.error('Error removing reaction', { error: String(e) });
      return false;
    }
  }

  async getCommitMessages(): Promise<string> {
    try {
      const commits = await this._request<{ commit?: { message?: string } }[]>(
        'GET',
        `/repos/${this.owner}/${this.repo}/pulls/${this.prNumber}/commits`,
      );
      return commits.map((c: { commit?: { message?: string } }) => c.commit?.message || '').join('');
    } catch {
      return '';
    }
  }

  getGitRepoUrl(_issuesOrPrUrl: string): string {
    return `${this.baseUrl}/${this.owner}/${this.repo}.git`;
  }

  getLineLink(relevantFile: string, relevantLineStart: number, relevantLineEnd?: number): string {
    const branch = this.getPrBranch();
    if (relevantLineStart === -1) {
      return `${this.baseUrl}/${this.owner}/${this.repo}/src/branch/${branch}/${relevantFile}`;
    } else if (relevantLineEnd) {
      return `${this.baseUrl}/${this.owner}/${this.repo}/src/branch/${branch}/${relevantFile}#L${relevantLineStart}-L${relevantLineEnd}`;
    }
    return `${this.baseUrl}/${this.owner}/${this.repo}/src/branch/${branch}/${relevantFile}#L${relevantLineStart}`;
  }

  getPrId(): string {
    try {
      return `${this.repo}/${this.prNumber}`;
    } catch {
      return '';
    }
  }

  protected _prepareCloneUrlWithToken(repoUrlToClone: string): string | null {
    const scheme = this.baseUrl.split('://')[0] + '://';
    const baseUrl = this.baseUrl.split('://')[1];
    if (!baseUrl || !repoUrlToClone.includes(baseUrl)) {
      console.error('URL mismatch for clone');
      return null;
    }
    const repoFullName = repoUrlToClone.split(baseUrl).pop();
    if (!repoFullName) return null;
    return `${scheme}${this.accessToken}@${baseUrl}${repoFullName}`;
  }

  static _parsePrUrl(prUrl: string): [string, string, number] {
    const parsedUrl = new URL(prUrl);
    let path = parsedUrl.pathname;
    if (path.startsWith('/api/v1')) {
      path = path.replace('/api/v1', '');
    }
    const parts = path.replace(/^\//, '').split('/');
    if (parts.length < 4 || parts[2] !== 'pulls') {
      throw new Error('The provided URL does not appear to be a Gitea PR URL');
    }
    const owner = parts[0];
    const repo = parts[1];
    const prNumber = parseInt(parts[3], 10);
    if (isNaN(prNumber)) throw new Error('Unable to convert PR number to integer');
    return [owner, repo, prNumber];
  }

  static _parseIssueUrl(issueUrl: string): [string, string, number] {
    const parsedUrl = new URL(issueUrl);
    let path = parsedUrl.pathname;
    if (path.startsWith('/api/v1')) {
      path = path.replace('/api/v1', '');
    }
    const parts = path.replace(/^\//, '').split('/');
    if (parts.length < 4 || parts[2] !== 'issues') {
      throw new Error('The provided URL does not appear to be a Gitea issue URL');
    }
    const owner = parts[0];
    const repo = parts[1];
    const issueNumber = parseInt(parts[3], 10);
    if (isNaN(issueNumber)) throw new Error('Unable to convert issue number to integer');
    return [owner, repo, issueNumber];
  }
}
