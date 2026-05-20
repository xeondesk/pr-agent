import { createHash } from 'crypto';
import { URL } from 'url';
import {
  GitProvider,
  IncrementalPR,
  MAX_FILES_ALLOWED_FULL,
} from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo, Range, PRReviewHeader } from '@pr-agent/types';

interface GithubComment {
  id: number;
  body?: string;
  html_url?: string;
  user?: { login: string };
  is_temporary?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

interface GithubFile {
  filename: string;
  patch?: string;
  status: string;
  additions?: number;
  deletions?: number;
  sha?: string;
  contents_url?: string;
  [key: string]: unknown;
}

interface GithubCommit {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
    author: { date: string };
  };
  files?: GithubFile[];
  [key: string]: unknown;
}

interface GithubPR {
  number: number;
  html_url: string;
  issue_url: string;
  title: string;
  body: string | null;
  head: { sha: string; ref: string; repo?: Record<string, unknown> };
  base: { sha: string; ref: string; repo?: Record<string, unknown> };
  labels: { name: string }[];
  user?: { login: string };
  [key: string]: unknown;
}

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class GithubProvider extends GitProvider {
  repoObj: Record<string, unknown> | null = null;
  installationId: string | null = null;
  maxCommentChars = 65000;
  baseUrl: string;
  baseUrlHtml: string;
  private _authToken: string;
  private _deploymentType: string;
  repo: string | null = null;
  prNum: number | null = null;
  pr: Record<string, unknown> | null = null;
  issueMain: Record<string, unknown> | null = null;
  githubUserId: string | null = null;
  diffFiles: FilePatchInfo[] | null = null;
  gitFiles: unknown[] | null = null;
  incremental: IncrementalPR;
  prCommits: GithubCommit[] | null = null;
  lastCommitId: GithubCommit | null = null;
  prUrl: string = '';
  auth: Record<string, unknown> | null = null;
  comments: GithubComment[] | null = null;
  unreviewedFilesSet: Record<string, unknown> = {};

  constructor(prUrl?: string) {
    super();
    this.baseUrl = (process.env['GITHUB_BASE_URL'] || 'https://api.github.com').replace(/\/+$/, '');
    this.baseUrlHtml = this.baseUrl.includes('api/')
      ? this.baseUrl.split('api/')[0].replace(/\/+$/, '')
      : 'https://github.com';

    this._deploymentType = process.env['GITHUB_DEPLOYMENT_TYPE'] || 'user';
    this._authToken = process.env['GITHUB_USER_TOKEN'] || process.env['GITHUB_TOKEN'] || '';

    if (this._deploymentType === 'app') {
      const appId = process.env['GITHUB_APP_ID'];
      const privateKey = process.env['GITHUB_PRIVATE_KEY'];
      if (!appId || !privateKey) {
        throw new Error('GitHub app ID and private key are required when using GitHub app deployment');
      }
      if (!this.installationId) {
        const instId = process.env['GITHUB_INSTALLATION_ID'];
        if (!instId) {
          throw new Error('GitHub app installation ID is required when using GitHub app deployment');
        }
        this.installationId = instId;
      }
    } else {
      if (!this._authToken) {
        throw new Error(
          'GitHub token is required. Set GITHUB_USER_TOKEN or GITHUB_TOKEN environment variable.',
        );
      }
    }

    this.incremental = new IncrementalPR(false);

    if (prUrl) {
      if (prUrl.includes('pull')) {
        this.setPr(prUrl);
        // In a real implementation, we'd fetch commits here
        this.prCommits = [];
        this.prUrl = this.getPrUrl();
      } else if (prUrl.includes('issue')) {
        // issue handling
      }
    }
  }

  private async _request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._authToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const err = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      (err as Record<string, unknown>).status = response.status;
      (err as Record<string, unknown>).body = errorBody;
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
  }

  private async _requestRaw(options: RequestOptions): Promise<{ headers: Headers; data: unknown }> {
    const url = `${this.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._authToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const err = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      (err as Record<string, unknown>).status = response.status;
      (err as Record<string, unknown>).body = errorBody;
      throw err;
    }

    const data = await response.json();
    return { headers: response.headers, data };
  }

  isSupported(_capability: string): boolean {
    return true;
  }

  private _getOwnerAndRepoPath(givenUrl: string): string {
    try {
      let repoPath: string | null = null;
      if (givenUrl.includes('issues')) {
        const [rp] = this._parseIssueUrl(givenUrl);
        repoPath = rp;
      } else if (givenUrl.includes('pull')) {
        const [rp] = this._parsePrUrl(givenUrl);
        repoPath = rp;
      } else if (givenUrl.endsWith('.git')) {
        const parsedUrl = new URL(givenUrl);
        repoPath = parsedUrl.pathname.replace('.git', '').replace(/^\//, '');
      }
      if (!repoPath) {
        console.error(`url is neither an issues url nor a PR url: ${givenUrl}`);
        return '';
      }
      return repoPath;
    } catch (e) {
      console.error(`unable to parse url: ${givenUrl}`, { error: String(e) });
      return '';
    }
  }

  getGitRepoUrl(issuesOrPrUrl: string): string {
    const repoPath = this._getOwnerAndRepoPath(issuesOrPrUrl);
    if (!repoPath || !issuesOrPrUrl.includes(repoPath)) {
      console.error(`Unable to retrieve owner/path from url: ${issuesOrPrUrl}`);
      return '';
    }
    return `${this.baseUrlHtml}/${repoPath}.git`;
  }

  getCanonicalUrlParts(repoGitUrl?: string, desiredBranch?: string): [string, string] {
    let owner: string | null = null;
    let repo: string | null = null;
    let schemeAndNetloc: string | null = null;

    if (repoGitUrl || this.issueMain) {
      desiredBranch = desiredBranch || (this.issueMain as Record<string, unknown>)?.['repository']?.['default_branch'] as string;
      const htmlUrl = repoGitUrl || (this.issueMain as Record<string, unknown>)?.['html_url'] as string;
      if (htmlUrl) {
        const parsedUrl = new URL(htmlUrl);
        schemeAndNetloc = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
        const repoPath = this._getOwnerAndRepoPath(htmlUrl);
        if (repoPath && repoPath.split('/').length === 2) {
          [owner, repo] = repoPath.split('/');
        } else {
          console.error(`Invalid repo_path: ${repoPath} from url: ${htmlUrl}`);
          return ['', ''];
        }
      }
    }

    if ((!owner || !repo) && this.repo) {
      [owner, repo] = this.repo.split('/');
      schemeAndNetloc = this.baseUrlHtml;
      desiredBranch = (this.repoObj as Record<string, unknown>)?.['default_branch'] as string || desiredBranch;
    }

    if (!schemeAndNetloc || !owner || !repo) {
      console.error('Unable to get canonical url parts since missing context');
      return ['', ''];
    }

    const prefix = `${schemeAndNetloc}/${owner}/${repo}/blob/${desiredBranch}`;
    const suffix = '';
    return [prefix, suffix];
  }

  getPrUrl(): string {
    return (this.pr as Record<string, unknown>)?.['html_url'] as string || '';
  }

  setPr(prUrl: string): void {
    const [repo, prNum] = this._parsePrUrl(prUrl);
    this.repo = repo;
    this.prNum = prNum;
    this.pr = {} as Record<string, unknown>;
  }

  async getIncrementalCommits(incremental: IncrementalPR): Promise<void> {
    this.incremental = incremental;
    if (this.incremental.isIncremental) {
      this.unreviewedFilesSet = {};
      await this._getIncrementalCommits();
    }
  }

  private async _getIncrementalCommits(): Promise<void> {
    if (!this.prCommits) {
      this.prCommits = [];
    }

    const previousReview = await this.getPreviousReview({ full: true, incremental: true });
    if (previousReview) {
      this.incremental.commitsRange = await this.getCommitRange();

      for (const commit of this.incremental.commitsRange as GithubCommit[]) {
        if (commit.commit?.message.startsWith(`Merge branch '${await this._getDefaultBranch()}'`)) {
          continue;
        }
        if (commit.files) {
          for (const file of commit.files) {
            this.unreviewedFilesSet[file.filename] = file;
          }
        }
      }
    } else {
      this.incremental.isIncremental = false;
    }
  }

  private async _getDefaultBranch(): Promise<string> {
    return 'main';
  }

  async getCommitRange(): Promise<GithubCommit[]> {
    const lastReviewTime = (this as Record<string, unknown>)['previousReview']?.['created_at'] as string;
    const lastReviewDate = new Date(lastReviewTime);
    let firstNewCommitIndex: number | null = null;

    if (!this.prCommits) return [];

    for (let index = this.prCommits.length - 1; index >= 0; index--) {
      const commitDate = new Date(this.prCommits[index].commit.author.date);
      if (commitDate > lastReviewDate) {
        this.incremental.firstNewCommit = this.prCommits[index];
        firstNewCommitIndex = index;
      } else {
        this.incremental.lastSeenCommit = this.prCommits[index];
        break;
      }
    }

    return firstNewCommitIndex !== null ? this.prCommits.slice(firstNewCommitIndex) : [];
  }

  async getPreviousReview(options: {
    full: boolean;
    incremental: boolean;
  }): Promise<GithubComment | null> {
    if (!options.full && !options.incremental) {
      throw new Error('At least one of full or incremental must be true');
    }
    if (!this.comments) {
      this.comments = [];
    }

    const prefixes: string[] = [];
    if (options.full) prefixes.push(PRReviewHeader.REGULAR);
    if (options.incremental) prefixes.push(PRReviewHeader.INCREMENTAL);

    for (let index = this.comments.length - 1; index >= 0; index--) {
      if (prefixes.some((prefix) => this.comments![index].body?.startsWith(prefix))) {
        return this.comments[index];
      }
    }
    return null;
  }

  getFiles(): unknown[] {
    if (this.incremental.isIncremental && Object.keys(this.unreviewedFilesSet).length > 0) {
      return Object.values(this.unreviewedFilesSet);
    }
    return this.gitFiles || [];
  }

  getNumOfFiles(): number {
    if (this.gitFiles && Array.isArray(this.gitFiles)) {
      return this.gitFiles.length;
    }
    return -1;
  }

  async getDiffFiles(): Promise<FilePatchInfo[]> {
    try {
      if (this.diffFiles) return this.diffFiles;

      const filesOriginal = this.getFiles() as GithubFile[];
      const files = filesOriginal;

      const diffFiles: FilePatchInfo[] = [];
      const invalidFilesNames: string[] = [];

      const repo = this.repoObj;
      const pr = this.pr as GithubPR;

      let mergeBaseSha = pr?.base?.sha || '';

      let counterValid = 0;

      for (const file of files) {
        const filename = file.filename;
        if (!this._isValidFile(filename)) {
          invalidFilesNames.push(filename);
          continue;
        }

        const patch = file.patch || '';
        let newFileContentStr = '';
        let originalFileContentStr = '';

        counterValid++;
        const avoidLoad = counterValid >= MAX_FILES_ALLOWED_FULL && !!patch && !this.incremental.isIncremental;

        if (!avoidLoad) {
          newFileContentStr = await this.getPrFileContent(filename, pr?.head?.sha || '');
        }

        if (this.incremental.isIncremental && Object.keys(this.unreviewedFilesSet).length > 0) {
          originalFileContentStr = await this.getPrFileContent(
            filename,
            this.incremental.lastSeenCommitSha || '',
          );
        } else if (!avoidLoad) {
          originalFileContentStr = await this.getPrFileContent(filename, mergeBaseSha);
        }

        let editType: EDIT_TYPE;
        switch (file.status) {
          case 'added':
            editType = EDIT_TYPE.ADDED;
            break;
          case 'removed':
            editType = EDIT_TYPE.DELETED;
            break;
          case 'renamed':
            editType = EDIT_TYPE.RENAMED;
            break;
          case 'modified':
            editType = EDIT_TYPE.MODIFIED;
            break;
          default:
            editType = EDIT_TYPE.UNKNOWN;
        }

        const numPlusLines = file.additions || 0;
        const numMinusLines = file.deletions || 0;

        diffFiles.push({
          base_file: originalFileContentStr,
          head_file: newFileContentStr,
          patch,
          filename,
          edit_type: editType,
          num_plus_lines: numPlusLines,
          num_minus_lines: numMinusLines,
        });
      }

      this.diffFiles = diffFiles;
      return diffFiles;
    } catch (e) {
      console.error('Failing to get diff files', { error: String(e) });
      throw e;
    }
  }

  private _isValidFile(filename: string): boolean {
    // basic check - in real implementation use language_handler
    return !filename.includes('.git') && !filename.endsWith('.pyc');
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    await this._request({
      method: 'PATCH',
      path: `/repos/${this.repo}/pulls/${this.prNum}`,
      body: { title: prTitle, body: prBody },
    });
  }

  getLatestCommitUrl(): string {
    return this.lastCommitId?.html_url || '';
  }

  getCommentUrl(comment: GithubComment): string {
    return comment.html_url || '';
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
    prComment = this.limitOutputCharacters(prComment, this.maxCommentChars);

    const response = await this._request<GithubComment>({
      method: 'POST',
      path: `/repos/${this.repo}/issues/${this.prNum}/comments`,
      body: { body: prComment },
    });

    response.is_temporary = isTemporary;
    return response;
  }

  async publishInlineComment(
    body: string,
    relevantFile: string,
    relevantLineInFile: string,
    originalSuggestion?: Record<string, unknown>,
  ): Promise<void> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    await this.publishInlineComments([
      this.createInlineComment(body, relevantFile, relevantLineInFile),
    ]);
  }

  createInlineComment(
    body: string,
    relevantFile: string,
    relevantLineInFile: string,
    absolutePosition?: number,
  ): Record<string, unknown> {
    body = this.limitOutputCharacters(body, this.maxCommentChars);
    const { position } = findLineNumberOfRelevantLineInFile(
      this.diffFiles || [],
      relevantFile.replace(/`/g, ''),
      relevantLineInFile,
      absolutePosition,
    );
    if (position === -1) {
      return {};
    }
    return { body, path: relevantFile.trim(), position };
  }

  async publishInlineComments(comments: Record<string, unknown>[], disableFallback: boolean = false): Promise<void> {
    try {
      await this._request({
        method: 'POST',
        path: `/repos/${this.repo}/pulls/${this.prNum}/reviews`,
        body: {
          commit_id: this.lastCommitId?.sha,
          comments,
        },
      });
    } catch (e) {
      const errStatus = (e as Record<string, unknown>).status;
      if (errStatus === 422 && !disableFallback) {
        try {
          await this._publishInlineCommentsFallbackWithVerification(comments);
        } catch (e2) {
          console.error('Failed to publish inline code comments fallback', { error: String(e2) });
          throw e2;
        }
      } else {
        throw e;
      }
    }
  }

  private async _publishInlineCommentsFallbackWithVerification(
    comments: Record<string, unknown>[],
  ): Promise<void> {
    const { verified, invalid } = await this._verifyCodeComments(comments);

    if (verified.length > 0) {
      try {
        await this._request({
          method: 'POST',
          path: `/repos/${this.repo}/pulls/${this.prNum}/reviews`,
          body: {
            commit_id: this.lastCommitId?.sha,
            comments: verified,
          },
        });
      } catch {
        // ignore
      }
    }

    if (invalid.length > 0) {
      const fixed = this._tryFixInvalidInlineComments(invalid.map(([c]) => c));
      for (const comment of fixed) {
        try {
          await this.publishInlineComments([comment], true);
        } catch {
          console.error('Failed to publish invalid comment as a single line comment');
        }
      }
    }
  }

  private async _verifyCodeComment(
    comment: Record<string, unknown>,
  ): Promise<{ verified: boolean; error?: Error }> {
    try {
      const { data } = await this._requestRaw({
        method: 'POST',
        path: `/repos/${this.repo}/pulls/${this.prNum}/reviews`,
        body: {
          commit_id: this.lastCommitId?.sha,
          comments: [comment],
        },
      });
      const reviewData = data as Record<string, unknown>;
      const pendingReviewId = reviewData['id'] as number;

      if (pendingReviewId) {
        try {
          await this._request({
            method: 'DELETE',
            path: `/repos/${this.repo}/pulls/${this.prNum}/reviews/${pendingReviewId}`,
          });
        } catch {
          // ignore
        }
      }
      return { verified: true };
    } catch (e) {
      return { verified: false, error: e as Error };
    }
  }

  private async _verifyCodeComments(
    comments: Record<string, unknown>[],
  ): Promise<{
    verified: Record<string, unknown>[];
    invalid: [Record<string, unknown>, Error][];
  }> {
    const verified: Record<string, unknown>[] = [];
    const invalid: [Record<string, unknown>, Error][] = [];

    for (const comment of comments) {
      await sleep(1000);
      const result = await this._verifyCodeComment(comment);
      if (result.verified) {
        verified.push(comment);
      } else {
        invalid.push([comment, result.error!]);
      }
    }

    return { verified, invalid };
  }

  private _tryFixInvalidInlineComments(invalidComments: Record<string, unknown>[]): Record<string, unknown>[] {
    const fixed: Record<string, unknown>[] = [];
    for (const comment of invalidComments) {
      try {
        const fixedComment = { ...comment };
        const body = fixedComment['body'] as string;
        if (body && body.includes('```suggestion')) {
          fixedComment['body'] = body.split('```suggestion')[0];
        }
        if (fixedComment['start_line'] !== undefined) {
          fixedComment['line'] = fixedComment['start_line'];
          delete fixedComment['start_line'];
        }
        if (fixedComment['start_side'] !== undefined) {
          fixedComment['side'] = fixedComment['start_side'];
          delete fixedComment['start_side'];
        }
        fixed.push(fixedComment);
      } catch {
        // skip
      }
    }
    return fixed;
  }

  async publishCodeSuggestions(codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    const postParametersList: Record<string, unknown>[] = [];
    const validated = this._validateCommentsInsideHunks(codeSuggestions);

    for (const suggestion of validated) {
      const body = suggestion['body'] as string;
      const relevantFile = suggestion['relevant_file'] as string;
      const relevantLinesStart = suggestion['relevant_lines_start'] as number;
      const relevantLinesEnd = suggestion['relevant_lines_end'] as number;

      if (!relevantLinesStart || relevantLinesStart === -1) {
        console.error('Failed to publish code suggestion, relevant_lines_start is', relevantLinesStart);
        continue;
      }

      if (relevantLinesEnd < relevantLinesStart) {
        console.error(`Failed to publish code suggestion, relevant_lines_end is ${relevantLinesEnd} and relevant_lines_start is ${relevantLinesStart}`);
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
      console.error('Failed to publish code suggestion', { error: String(e) });
      return false;
    }
  }

  async editComment(comment: GithubComment, body: string): Promise<void> {
    try {
      body = this.limitOutputCharacters(body, this.maxCommentChars);
      await this._request({
        method: 'PATCH',
        path: `/repos/${this.repo}/issues/comments/${comment.id}`,
        body: { body },
      });
    } catch (e) {
      const errStatus = (e as Record<string, unknown>).status;
      if (errStatus === 403) {
        console.warn('Failed to edit github comment due to permission restrictions', { error: String(e) });
      } else {
        console.error('Failed to edit github comment', { error: String(e) });
      }
    }
  }

  async editCommentFromCommentId(commentId: number, body: string): Promise<void> {
    try {
      body = this.limitOutputCharacters(body, this.maxCommentChars);
      await this._request({
        method: 'PATCH',
        path: `/repos/${this.repo}/issues/comments/${commentId}`,
        body: { body },
      });
    } catch (e) {
      console.error('Failed to edit comment', { error: String(e) });
    }
  }

  async replyToCommentFromCommentId(commentId: number, body: string): Promise<void> {
    try {
      body = this.limitOutputCharacters(body, this.maxCommentChars);
      await this._request({
        method: 'POST',
        path: `/repos/${this.repo}/pulls/${this.prNum}/comments/${commentId}/replies`,
        body: { body },
      });
    } catch (e) {
      console.error('Failed to reply comment', { error: String(e) });
    }
  }

  async getCommentBodyFromCommentId(commentId: number): Promise<string | null> {
    try {
      const { data } = await this._requestRaw({
        method: 'GET',
        path: `/repos/${this.repo}/issues/comments/${commentId}`,
      });
      return (data as Record<string, unknown>)['body'] as string || null;
    } catch (e) {
      console.error('Failed to get comment', { error: String(e) });
      return null;
    }
  }

  async removeInitialComment(): Promise<void> {
    // optional
  }

  async removeComment(comment: GithubComment): Promise<void> {
    try {
      await this._request({
        method: 'DELETE',
        path: `/repos/${this.repo}/issues/comments/${comment.id}`,
      });
    } catch (e) {
      console.error('Failed to remove comment', { error: String(e) });
    }
  }

  getTitle(): string {
    return (this.pr as Record<string, unknown>)['title'] as string || '';
  }

  async getLanguages(): Promise<Record<string, number>> {
    return this._request({
      method: 'GET',
      path: `/repos/${this.repo}/languages`,
    });
  }

  getPrBranch(): string {
    return (this.pr as GithubPR)?.head?.ref || '';
  }

  getPrOwnerId(): string | null {
    if (!this.repo) return null;
    return this.repo.split('/')[0];
  }

  async getPrDescriptionFull(): Promise<string> {
    return (this.pr as GithubPR)?.body || '';
  }

  async getUserId(): Promise<string | null> {
    if (!this.githubUserId) {
      try {
        const user = await this._request<{ login: string }>({
          method: 'GET',
          path: '/user',
        });
        this.githubUserId = user.login;
      } catch {
        this.githubUserId = null;
      }
    }
    return this.githubUserId;
  }

  async getIssueComments(): Promise<GithubComment[]> {
    return this._request({
      method: 'GET',
      path: `/repos/${this.repo}/issues/${this.prNum}/comments`,
    });
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      const { data } = await this._requestRaw({
        method: 'GET',
        path: `/repos/${this.repo}/contents/.pr_agent.toml`,
      });
      const content = (data as Record<string, unknown>)['content'] as string;
      if (content) {
        return Buffer.from(content, 'base64');
      }
      return null;
    } catch {
      return null;
    }
  }

  getWorkspaceName(): string {
    return this.repo?.split('/')[0] || '';
  }

  async addEyesReaction(issueCommentId: number, disableEyes: boolean = false): Promise<number | null> {
    if (disableEyes) return null;
    try {
      const { data } = await this._requestRaw({
        method: 'POST',
        path: `/repos/${this.repo}/issues/comments/${issueCommentId}/reactions`,
        body: { content: 'eyes' },
        headers: { Accept: 'application/vnd.github.squirrel-girl-preview+json' },
      });
      return (data as Record<string, unknown>)['id'] as number || null;
    } catch (e) {
      console.warn('Failed to add eyes reaction', { error: String(e) });
      return null;
    }
  }

  async removeReaction(issueCommentId: number, reactionId: number | string): Promise<boolean> {
    try {
      await this._request({
        method: 'DELETE',
        path: `/repos/${this.repo}/issues/comments/${issueCommentId}/reactions/${reactionId}`,
        headers: { Accept: 'application/vnd.github.squirrel-girl-preview+json' },
      });
      return true;
    } catch (e) {
      console.error('Failed to remove eyes reaction', { error: String(e) });
      return false;
    }
  }

  private _parsePrUrl(prUrl: string): [string, number] {
    const parsedUrl = new URL(prUrl);
    let path = parsedUrl.pathname;

    if (path.startsWith('/api/v3')) {
      path = path.replace('/api/v3', '');
    }

    const pathParts = path.replace(/^\//, '').split('/');

    if (parsedUrl.hostname === 'api.github.com' || prUrl.includes('/api/v3')) {
      if (pathParts.length < 5 || pathParts[3] !== 'pulls') {
        throw new Error('The provided URL does not appear to be a GitHub PR URL');
      }
      const repoName = pathParts.slice(1, 3).join('/');
      const prNumber = parseInt(pathParts[4], 10);
      if (isNaN(prNumber)) throw new Error('Unable to convert PR number to integer');
      return [repoName, prNumber];
    }

    if (pathParts.length < 4 || pathParts[2] !== 'pull') {
      throw new Error('The provided URL does not appear to be a GitHub PR URL');
    }

    const repoName = pathParts.slice(0, 2).join('/');
    const prNumber = parseInt(pathParts[3], 10);
    if (isNaN(prNumber)) throw new Error('Unable to convert PR number to integer');
    return [repoName, prNumber];
  }

  private _parseIssueUrl(issueUrl: string): [string, number] {
    const parsedUrl = new URL(issueUrl);
    let path = parsedUrl.pathname;

    if (path.startsWith('/api/v3')) {
      path = path.replace('/api/v3', '');
    }

    const pathParts = path.replace(/^\//, '').split('/');

    if (parsedUrl.hostname === 'api.github.com' || issueUrl.includes('/api/v3')) {
      if (pathParts.length < 5 || pathParts[3] !== 'issues') {
        throw new Error('The provided URL does not appear to be a GitHub issue URL');
      }
      const repoName = pathParts.slice(1, 3).join('/');
      const issueNumber = parseInt(pathParts[4], 10);
      if (isNaN(issueNumber)) throw new Error('Unable to convert issue number to integer');
      return [repoName, issueNumber];
    }

    if (pathParts.length < 4 || pathParts[2] !== 'issues') {
      throw new Error('The provided URL does not appear to be a GitHub issue URL');
    }

    const repoName = pathParts.slice(0, 2).join('/');
    const issueNumber = parseInt(pathParts[3], 10);
    if (isNaN(issueNumber)) throw new Error('Unable to convert issue number to integer');
    return [repoName, issueNumber];
  }

  getPrFileContent(filePath: string, branch: string): string {
    // This would make an API call - simplified for now
    return '';
  }

  async publishLabels(prTypes: string[]): Promise<void> {
    try {
      const labelColorMap: Record<string, string> = {
        'Bug fix': '1d76db',
        Tests: 'e99695',
        'Bug fix with tests': 'c5def5',
        Enhancement: 'bfd4f2',
        Documentation: 'd4c5f9',
        Other: 'd1bcf9',
      };

      const postParameters = prTypes.map((p) => ({
        name: p,
        color: labelColorMap[p] || 'd1bcf9',
      }));

      await this._request({
        method: 'PUT',
        path: `/repos/${this.repo}/issues/${this.prNum}/labels`,
        body: postParameters,
      });
    } catch (e) {
      console.warn('Failed to publish labels', { error: String(e) });
    }
  }

  async getPrLabels(update: boolean = false): Promise<string[]> {
    try {
      if (!update) {
        const pr = this.pr as GithubPR;
        return pr.labels?.map((l) => l.name) || [];
      }
      const labels = await this._request<{ name: string }[]>({
        method: 'GET',
        path: `/repos/${this.repo}/issues/${this.prNum}/labels`,
      });
      return labels.map((l) => l.name);
    } catch (e) {
      console.error('Failed to get labels', { error: String(e) });
      return [];
    }
  }

  async getRepoLabels(): Promise<unknown[]> {
    return this._request({
      method: 'GET',
      path: `/repos/${this.repo}/labels`,
    });
  }

  async getCommitMessages(): Promise<string> {
    const maxTokens = parseInt(process.env['MAX_COMMITS_TOKENS'] || '0', 10);
    try {
      const commits = await this._request<{ commit: { message: string } }[]>({
        method: 'GET',
        path: `/repos/${this.repo}/pulls/${this.prNum}/commits`,
      });
      const messages = commits.map((c, i) => `${i + 1}. ${c.commit.message}`);
      let result = messages.join('\n');
      if (maxTokens > 0) {
        // simple token truncation
        result = result.slice(0, maxTokens * 4);
      }
      return result;
    } catch {
      return '';
    }
  }

  getLineLink(relevantFile: string, relevantLineStart: number, relevantLineEnd?: number): string {
    const shaFile = createHash('sha256').update(relevantFile).digest('hex');
    let link: string;
    if (relevantLineStart === -1) {
      link = `${this.baseUrlHtml}/${this.repo}/pull/${this.prNum}/files#diff-${shaFile}`;
    } else if (relevantLineEnd) {
      link = `${this.baseUrlHtml}/${this.repo}/pull/${this.prNum}/files#diff-${shaFile}R${relevantLineStart}-R${relevantLineEnd}`;
    } else {
      link = `${this.baseUrlHtml}/${this.repo}/pull/${this.prNum}/files#diff-${shaFile}R${relevantLineStart}`;
    }
    return link;
  }

  getLinesLinkOriginalFile(filepath: string, componentRange: Range): string {
    const lineStart = componentRange.line_start + 1;
    const lineEnd = componentRange.line_end + 1;
    return `${this.baseUrlHtml}/${this.repo}/blob/${this.lastCommitId?.sha}/${filepath}/#L${lineStart}-L${lineEnd}`;
  }

  getPrId(): string {
    try {
      return `${this.repo}/${this.prNum}`;
    } catch {
      return '';
    }
  }

  async autoApprove(): Promise<boolean> {
    try {
      const { data } = await this._requestRaw({
        method: 'POST',
        path: `/repos/${this.repo}/pulls/${this.prNum}/reviews`,
        body: { event: 'APPROVE' },
      });
      return (data as Record<string, unknown>)['state'] === 'APPROVED';
    } catch (e) {
      console.error('Failed to auto-approve', { error: String(e) });
      return false;
    }
  }

  protected _prepareCloneUrlWithToken(repoUrlToClone: string): string | null {
    const scheme = 'https://';
    const githubToken = this._authToken;
    const githubBaseUrl = this.baseUrlHtml;

    if (!githubToken || !githubBaseUrl) {
      console.error('Either missing auth token or missing base url');
      return null;
    }

    if (!githubBaseUrl.startsWith(scheme)) {
      console.error(`Base url: ${githubBaseUrl} is missing prefix: ${scheme}`);
      return null;
    }

    const githubCom = githubBaseUrl.split(scheme)[1];
    if (!githubCom) {
      console.error(`Base url: ${githubBaseUrl} has an empty base url`);
      return null;
    }

    if (!repoUrlToClone.includes(githubCom)) {
      console.error(`url to clone: ${repoUrlToClone} does not contain ${githubCom}`);
      return null;
    }

    const repoFullName = repoUrlToClone.split(githubCom).pop();
    if (!repoFullName) {
      console.error(`url to clone: ${repoUrlToClone} is malformed`);
      return null;
    }

    let cloneUrl = scheme;
    if (this._deploymentType === 'app') {
      cloneUrl += 'git:';
    }
    cloneUrl += `${githubToken}@${githubCom}${repoFullName}`;
    return cloneUrl;
  }

  private _validateCommentsInsideHunks(codeSuggestions: Record<string, unknown>[]): Record<string, unknown>[] {
    return codeSuggestions;
  }
}

function findLineNumberOfRelevantLineInFile(
  diffFiles: FilePatchInfo[],
  relevantFile: string,
  _relevantLineInFile: string,
  _absolutePosition?: number,
): { position: number; absolutePosition: number } {
  // Simplified - real implementation would search through patches
  return { position: -1, absolutePosition: -1 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
