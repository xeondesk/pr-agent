import { URL } from 'url';
import { GitProvider, MAX_FILES_ALLOWED_FULL } from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo } from '@pr-agent/types';

interface GitLabChange {
  old_path: string;
  new_path: string;
  diff?: string;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
}

interface GitLabMR {
  web_url?: string;
  title?: string;
  description?: string;
  source_branch?: string;
  target_branch?: string;
  labels?: string[];
  diff_refs?: { base_sha: string; head_sha: string };
  changes?(): { get: (key: string) => unknown };
  [key: string]: unknown;
}

export class GitLabProvider extends GitProvider {
  private gitlabUrl: string;
  private accessToken: string;
  private sslVerify: boolean;
  private authMethod: string;
  maxCommentChars = 65000;
  idProject: string | null = null;
  idMr: number | null = null;
  mr: Record<string, unknown> | null = null;
  diffFiles: FilePatchInfo[] | null = null;
  gitFiles: string[] | null = null;
  tempComments: unknown[] = [];
  prUrl: string | null = null;
  lastDiff: unknown = null;
  incremental: boolean = false;

  constructor(mergeRequestUrl?: string, incremental: boolean = false) {
    super();

    this.gitlabUrl = process.env['GITLAB_URL'] || '';
    if (!this.gitlabUrl) {
      throw new Error('GitLab URL is not set. Set GITLAB_URL environment variable.');
    }

    this.sslVerify = process.env['GITLAB_SSL_VERIFY'] !== 'false';
    this.accessToken = process.env['GITLAB_PERSONAL_ACCESS_TOKEN'] || '';
    if (!this.accessToken) {
      throw new Error('GitLab personal access token is not set. Set GITLAB_PERSONAL_ACCESS_TOKEN.');
    }

    this.authMethod = process.env['GITLAB_AUTH_TYPE'] || 'oauth_token';
    if (!['oauth_token', 'private_token'].includes(this.authMethod)) {
      throw new Error(`Unsupported GITLAB_AUTH_TYPE: '${this.authMethod}'. Must be 'oauth_token' or 'private_token'.`);
    }

    this.prUrl = mergeRequestUrl || null;
    if (mergeRequestUrl) {
      this._setMergeRequest(mergeRequestUrl);
    }
    this.incremental = incremental;
  }

  private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.gitlabUrl}/api/v4${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authMethod === 'oauth_token') {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    } else {
      headers['PRIVATE-TOKEN'] = this.accessToken;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  isSupported(capability: string): boolean {
    if (
      ['get_issue_comments', 'create_inline_comment', 'publish_inline_comments', 'publish_file_comments'].includes(
        capability,
      )
    ) {
      return false;
    }
    return true;
  }

  private _getProjectPathFromPrOrIssueUrl(prOrIssueUrl: string): string {
    let repoProjectPath: string | null = null;
    let url = prOrIssueUrl;
    if (url.includes('issues')) {
      url = url.replace('issues', 'merge_requests');
    }
    if (url.includes('merge_requests')) {
      repoProjectPath = this._parseMergeRequestUrl(url)[0];
    }
    if (!repoProjectPath) {
      throw new Error(`url is not a valid merge requests url: ${prOrIssueUrl}`);
    }
    return repoProjectPath;
  }

  getGitRepoUrl(issuesOrPrUrl: string): string {
    const repoPath = this._getProjectPathFromPrOrIssueUrl(issuesOrPrUrl);
    if (!repoPath || !issuesOrPrUrl.includes(repoPath)) {
      console.error(`Unable to retrieve project path from url: ${issuesOrPrUrl}`);
      return '';
    }
    const base = issuesOrPrUrl.split(repoPath)[0];
    return `${base}${repoPath}.git`;
  }

  getCanonicalUrlParts(repoGitUrl?: string, desiredBranch?: string): [string, string] {
    let repoPath = '';
    if (!repoGitUrl && !this.prUrl) {
      console.error('Cannot get canonical URL parts: missing context');
      return ['', ''];
    }
    if (!repoGitUrl) {
      repoPath = this._getProjectPathFromPrOrIssueUrl(this.prUrl!);
      desiredBranch = desiredBranch || 'main';
    } else {
      repoPath = repoGitUrl.split('.git')[0].split('.com/').pop() || '';
    }
    const prefix = `${this.gitlabUrl}/${repoPath}/-/blob/${desiredBranch}`;
    const suffix = '?ref_type=heads';
    return [prefix, suffix];
  }

  private _setMergeRequest(mergeRequestUrl: string): void {
    const [idProject, idMr] = this._parseMergeRequestUrl(mergeRequestUrl);
    this.idProject = idProject;
    this.idMr = idMr;
  }

  private async _getMr(): Promise<Record<string, unknown>> {
    return this._request('GET', `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}`);
  }

  getPrFileContent(filePath: string, branch: string): string {
    return '';
  }

  async getDiffFiles(): Promise<FilePatchInfo[]> {
    if (this.diffFiles) return this.diffFiles;

    try {
      const mrData = await this._getMr();
      const changes = await this._request<GitLabChange[]>(
        'GET',
        `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/changes`,
      );

      const rawChanges = (changes as unknown as Record<string, unknown>)['changes'] as GitLabChange[] || [];
      const diffFiles: FilePatchInfo[] = [];
      const invalidFilesNames: string[] = [];
      let counterValid = 0;

      for (const diff of rawChanges) {
        if (!this._isValidFile(diff.new_path)) {
          invalidFilesNames.push(diff.new_path);
          continue;
        }

        counterValid++;
        let originalFileContentStr = '';
        let newFileContentStr = '';
        const diffRefs = mrData['diff_refs'] as Record<string, string> | undefined;

        if (counterValid < MAX_FILES_ALLOWED_FULL || !diff.diff) {
          if (diffRefs) {
            originalFileContentStr = await this.getPrFileContent(diff.old_path, diffRefs['base_sha']);
            newFileContentStr = await this.getPrFileContent(diff.new_path, diffRefs['head_sha']);
          }
        } else {
          if (counterValid === MAX_FILES_ALLOWED_FULL) {
            console.info('Too many files in PR, will avoid loading full content for rest of files');
          }
        }

        let editType: EDIT_TYPE;
        if (diff.new_file) editType = EDIT_TYPE.ADDED;
        else if (diff.deleted_file) editType = EDIT_TYPE.DELETED;
        else if (diff.renamed_file) editType = EDIT_TYPE.RENAMED;
        else editType = EDIT_TYPE.MODIFIED;

        const filename = diff.new_path;
        const patch = diff.diff || '';

        const patchLines = patch.split('\n');
        const numPlusLines = patchLines.filter((l) => l.startsWith('+')).length;
        const numMinusLines = patchLines.filter((l) => l.startsWith('-')).length;

        diffFiles.push({
          base_file: originalFileContentStr,
          head_file: newFileContentStr,
          patch,
          filename,
          edit_type: editType,
          old_filename: diff.old_path === diff.new_path ? null : diff.old_path,
          num_plus_lines: numPlusLines,
          num_minus_lines: numMinusLines,
        });
      }

      this.diffFiles = diffFiles;
      return diffFiles;
    } catch (e) {
      console.error('Failed to get diff files', { error: String(e) });
      return [];
    }
  }

  private _isValidFile(filename: string): boolean {
    return !filename.includes('.git');
  }

  getFiles(): string[] {
    return this.gitFiles || [];
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    try {
      await this._request('PUT', `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}`, {
        title: prTitle,
        description: prBody,
      });
    } catch (e) {
      console.error('Could not update merge request description', { error: String(e) });
    }
  }

  getLatestCommitUrl(): string {
    return '';
  }

  getCommentUrl(comment: Record<string, unknown>): string {
    return `${(this.mr as Record<string, unknown>)?.['web_url'] || ''}#note_${comment['id']}`;
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

  async publishComment(mrComment: string, isTemporary: boolean = false): Promise<unknown> {
    mrComment = this.limitOutputCharacters(mrComment, this.maxCommentChars);
    const comment = await this._request<Record<string, unknown>>(
      'POST',
      `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes`,
      { body: mrComment },
    );
    if (isTemporary) {
      this.tempComments.push(comment);
    }
    return comment;
  }

  async editComment(comment: Record<string, unknown>, body: string): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    await this._request(
      'PUT',
      `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes/${comment['id']}`,
      { body },
    );
  }

  async editCommentFromCommentId(commentId: number, body: string): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    await this._request(
      'PUT',
      `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes/${commentId}`,
      { body },
    );
  }

  async replyToCommentFromCommentId(commentId: number, body: string): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    await this._request(
      'POST',
      `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/discussions/${commentId}/notes`,
      { body },
    );
  }

  async publishInlineComment(
    body: string,
    _relevantFile: string,
    _relevantLineInFile: string,
    _originalSuggestion?: Record<string, unknown>,
  ): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    // GitLab inline comments require position calculation
    console.warn('GitLab inline comments are not fully implemented');
  }

  createInlineComment(
    _body: string,
    _relevantFile: string,
    _relevantLineInFile: string,
    _absolutePosition?: number,
  ): Record<string, unknown> {
    throw new Error('GitLab provider does not support creating inline comments yet');
  }

  async publishInlineComments(_comments: Record<string, unknown>[]): Promise<void> {
    throw new Error('GitLab provider does not support publishing inline comments yet');
  }

  async publishCodeSuggestions(_codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    return false;
  }

  async removeInitialComment(): Promise<void> {
    for (const comment of this.tempComments) {
      await this.removeComment(comment as Record<string, unknown>);
    }
  }

  async removeComment(comment: Record<string, unknown>): Promise<void> {
    try {
      await this._request(
        'DELETE',
        `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes/${comment['id']}`,
      );
    } catch (e) {
      console.error('Failed to remove comment', { error: String(e) });
    }
  }

  getTitle(): string {
    return (this.mr as Record<string, unknown>)?.['title'] as string || '';
  }

  async getLanguages(): Promise<Record<string, number>> {
    return this._request(
      'GET',
      `/projects/${encodeURIComponent(this.idProject!)}/languages`,
    );
  }

  getPrBranch(): string {
    return (this.mr as Record<string, unknown>)?.['source_branch'] as string || '';
  }

  async getPrDescriptionFull(): Promise<string> {
    return (this.mr as Record<string, unknown>)?.['description'] as string || '';
  }

  async getUserId(): Promise<string | null> {
    return null;
  }

  async getIssueComments(): Promise<Record<string, unknown>[]> {
    const notes = await this._request<Record<string, unknown>[]>(
      'GET',
      `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes`,
    );
    return notes.reverse();
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      const content = await this._request<string>(
        'GET',
        `/projects/${encodeURIComponent(this.idProject!)}/repository/files/${encodeURIComponent('.pr_agent.toml')}/raw?ref=main`,
      );
      return typeof content === 'string' ? content : null;
    } catch {
      return null;
    }
  }

  getWorkspaceName(): string {
    return this.idProject?.split('/')[0] || '';
  }

  async addEyesReaction(issueCommentId: number, disableEyes: boolean = false): Promise<number | null> {
    if (disableEyes) return null;
    try {
      const result = await this._request<Record<string, unknown>>(
        'POST',
        `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes/${issueCommentId}/award_emoji`,
        { name: 'eyes' },
      );
      return result['id'] as number || null;
    } catch (e) {
      console.warn('Failed to add eyes reaction', { error: String(e) });
      return null;
    }
  }

  async removeReaction(issueCommentId: number, reactionId: number | string): Promise<boolean> {
    try {
      const awardEmojis = await this._request<Record<string, unknown>[]>(
        'GET',
        `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes/${issueCommentId}/award_emoji`,
      );
      for (const emoji of awardEmojis) {
        if (emoji['name'] === reactionId) {
          await this._request(
            'DELETE',
            `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/notes/${issueCommentId}/award_emoji/${emoji['id']}`,
          );
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error('Failed to remove reaction', { error: String(e) });
      return false;
    }
  }

  private _parseMergeRequestUrl(mergeRequestUrl: string): [string, number] {
    const parsedUrl = new URL(mergeRequestUrl);
    const pathParts = parsedUrl.pathname.replace(/^\//, '').split('/');
    const mrIndex = pathParts.indexOf('merge_requests');

    if (mrIndex === -1) {
      throw new Error('The provided URL does not appear to be a GitLab merge request URL');
    }

    if (pathParts.length <= mrIndex + 1) {
      throw new Error('The provided URL does not contain a merge request ID');
    }

    const mrId = parseInt(pathParts[mrIndex + 1], 10);
    if (isNaN(mrId)) throw new Error('Unable to convert merge request ID to integer');

    const projectPath = pathParts.slice(0, mrIndex).join('/');
    const cleanProjectPath = projectPath.endsWith('/-') ? projectPath.slice(0, -2) : projectPath;

    return [cleanProjectPath, mrId];
  }

  async publishLabels(prTypes: string[]): Promise<void> {
    try {
      await this._request(
        'PUT',
        `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}`,
        { labels: [...new Set(prTypes)].join(',') },
      );
    } catch (e) {
      console.warn('Failed to publish labels', { error: String(e) });
    }
  }

  async getPrLabels(_update: boolean = false): Promise<string[]> {
    const mrData = await this._getMr();
    return (mrData['labels'] as string[]) || [];
  }

  async getRepoLabels(): Promise<unknown[]> {
    return this._request(
      'GET',
      `/projects/${encodeURIComponent(this.idProject!)}/labels`,
    );
  }

  async getCommitMessages(): Promise<string> {
    try {
      const commits = await this._request<{ message: string }[]>(
        'GET',
        `/projects/${encodeURIComponent(this.idProject!)}/merge_requests/${this.idMr}/commits`,
      );
      return commits.map((c, i) => `${i + 1}. ${c.message}`).join('\n');
    } catch {
      return '';
    }
  }

  getPrId(): string {
    try {
      return (this.mr as Record<string, unknown>)?.['web_url'] as string || '';
    } catch {
      return '';
    }
  }

  getLineLink(relevantFile: string, relevantLineStart: number, relevantLineEnd?: number): string {
    const branch = this.getPrBranch();
    if (relevantLineStart === -1) {
      return `${this.gitlabUrl}/${this.idProject}/-/blob/${branch}/${relevantFile}?ref_type=heads`;
    } else if (relevantLineEnd) {
      return `${this.gitlabUrl}/${this.idProject}/-/blob/${branch}/${relevantFile}?ref_type=heads#L${relevantLineStart}-${relevantLineEnd}`;
    }
    return `${this.gitlabUrl}/${this.idProject}/-/blob/${branch}/${relevantFile}?ref_type=heads#L${relevantLineStart}`;
  }

  protected _prepareCloneUrlWithToken(repoUrlToClone: string): string | null {
    if (!repoUrlToClone.includes('gitlab.')) {
      console.error('Repo URL is not a valid gitlab URL.');
      return null;
    }

    const [scheme, baseUrl] = repoUrlToClone.split('gitlab.');
    const accessToken = this.accessToken;

    if (!scheme || !accessToken || !baseUrl) {
      console.error('Either no access token found, or repo URL is missing prefix/base URL.');
      return null;
    }

    return `${scheme}oauth2:${accessToken}@gitlab.${baseUrl}`;
  }
}
