import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { FilePatchInfo, EDIT_TYPE, Range, PRReviewHeader } from '@pr-agent/types';

export const MAX_FILES_ALLOWED_FULL = 50;

export interface GitSslEnv {
  GIT_SSL_CAINFO?: string;
  REQUESTS_CA_BUNDLE?: string;
  [key: string]: string | undefined;
}

export function getGitSslEnv(): GitSslEnv {
  const sslCertFile = process.env.SSL_CERT_FILE;
  const requestsCaBundle = process.env.REQUESTS_CA_BUNDLE;
  const gitSslCaInfo = process.env.GIT_SSL_CAINFO;

  let chosenCertFile = '';

  if (sslCertFile) {
    if (existsSync(sslCertFile)) {
      if (
        (requestsCaBundle && requestsCaBundle !== sslCertFile) ||
        (gitSslCaInfo && gitSslCaInfo !== sslCertFile)
      ) {
        console.warn(
          `Found mismatch among: SSL_CERT_FILE, REQUESTS_CA_BUNDLE, GIT_SSL_CAINFO. Using SSL_CERT_FILE.`,
          { sslCertFile, requestsCaBundle, gitSslCaInfo },
        );
      } else {
        console.info(`Using SSL certificate bundle for git operations`, { sslCertFile });
      }
      chosenCertFile = sslCertFile;
    } else {
      console.warn('SSL certificate bundle not found', { sslCertFile });
    }
  } else if (requestsCaBundle) {
    if (existsSync(requestsCaBundle)) {
      if (gitSslCaInfo && gitSslCaInfo !== requestsCaBundle) {
        console.warn(`Found mismatch between: REQUESTS_CA_BUNDLE, GIT_SSL_CAINFO. Using REQUESTS_CA_BUNDLE.`, {
          requestsCaBundle,
          gitSslCaInfo,
        });
      } else {
        console.info('Using SSL certificate bundle from REQUESTS_CA_BUNDLE for git operations', { requestsCaBundle });
      }
      chosenCertFile = requestsCaBundle;
    } else {
      console.warn('requests CA bundle not found', { requestsCaBundle });
    }
  } else if (gitSslCaInfo) {
    if (existsSync(gitSslCaInfo)) {
      console.info('Using git SSL CA info from GIT_SSL_CAINFO for git operations', { gitSslCaInfo });
      chosenCertFile = gitSslCaInfo;
    } else {
      console.warn('git SSL CA info not found', { gitSslCaInfo });
    }
  } else {
    console.warn('Neither SSL_CERT_FILE nor REQUESTS_CA_BUNDLE nor GIT_SSL_CAINFO are defined');
  }

  const env: GitSslEnv = { ...process.env };
  if (chosenCertFile) {
    env.GIT_SSL_CAINFO = chosenCertFile;
    env.REQUESTS_CA_BUNDLE = chosenCertFile;
  }
  return env;
}

export class ScopedClonedRepo {
  path: string;

  constructor(destFolder: string) {
    this.path = destFolder;
  }

  dispose(): void {
    if (this.path && existsSync(this.path)) {
      try {
        rmSync(this.path, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

function rmSync(dir: string, opts: { recursive: boolean; force: boolean }): void {
  try {
    execSync(`rm -rf "${dir}"`, { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

export abstract class GitProvider {
  abstract isSupported(capability: string): boolean;

  getGitRepoUrl(_issuesOrPrUrl: string): string {
    console.warn('Not implemented! Returning empty url');
    return '';
  }

  getCanonicalUrlParts(_repoGitUrl: string, _desiredBranch: string): [string, string] {
    console.warn('Not implemented! Returning empty prefix and suffix');
    return ['', ''];
  }

  protected _prepareCloneUrlWithToken(_repoUrlToClone: string): string | null {
    console.warn('Not implemented! Returning null');
    return null;
  }

  protected _cloneInner(
    repoUrl: string,
    destFolder: string,
    operationTimeoutInSeconds?: number,
  ): void {
    const sslEnv = getGitSslEnv();

    const args = [
      'git',
      'clone',
      '--filter=blob:none',
      '--depth',
      '1',
      repoUrl,
      destFolder,
    ];

    const result = spawnSync(args[0], args.slice(1), {
      env: { ...process.env, ...sslEnv },
      stdio: 'ignore',
      timeout: (operationTimeoutInSeconds ?? 20) * 1000,
    });

    if (result.error || result.status !== 0) {
      throw new Error(`git clone failed: ${result.error?.message ?? `exit code ${result.status}`}`);
    }
  }

  static readonly CLONE_TIMEOUT_SEC = 20;

  clone(
    repoUrlToClone: string,
    destFolder: string,
    removeDestFolder: boolean = true,
    operationTimeoutInSeconds: number = GitProvider.CLONE_TIMEOUT_SEC,
  ): ScopedClonedRepo | null {
    const cloneUrl = this._prepareCloneUrlWithToken(repoUrlToClone);
    if (!cloneUrl) {
      console.error('Clone failed: Unable to obtain url to clone.');
      return null;
    }
    try {
      if (removeDestFolder && existsSync(destFolder)) {
        rmSync(destFolder, { recursive: true, force: true });
      }
      this._cloneInner(cloneUrl, destFolder, operationTimeoutInSeconds);
      return new ScopedClonedRepo(destFolder);
    } catch (e) {
      console.error('Clone failed: Could not clone url.', { error: String(e), url: cloneUrl, destFolder });
      return null;
    }
  }

  abstract getFiles(): unknown[];

  abstract getDiffFiles(): FilePatchInfo[];

  getIncrementalCommits(_isIncremental: unknown): void {
    // optional
  }

  abstract publishDescription(prTitle: string, prBody: string): Promise<void>;

  abstract publishCodeSuggestions(codeSuggestions: Record<string, unknown>[]): Promise<boolean>;

  abstract getLanguages(): Promise<Record<string, number> | Record<string, unknown>>;

  abstract getPrBranch(): string;

  abstract getUserId(): Promise<string | number | null>;

  abstract getPrDescriptionFull(): Promise<string>;

  async editComment(_comment: unknown, _body: string): Promise<void> {
    // optional
  }

  async editCommentFromCommentId(_commentId: number, _body: string): Promise<void> {
    // optional
  }

  async getCommentBodyFromCommentId(_commentId: number): Promise<string | null> {
    return null;
  }

  async replyToCommentFromCommentId(_commentId: number, _body: string): Promise<void> {
    // optional
  }

  async getPrDescription(
    full: boolean = true,
    splitChangesWalkthrough: boolean = false,
  ): Promise<string | [string, unknown[]]> {
    const description = full
      ? await this.getPrDescriptionFull()
      : await this.getUserDescription();
    if (splitChangesWalkthrough) {
      const [desc, files] = await processDescription(description);
      return [desc, files];
    }
    return description;
  }

  private _userDescription: string | null = null;

  async getUserDescription(): Promise<string> {
    if (this._userDescription !== null) {
      return this._userDescription;
    }

    const description = ((await this.getPrDescriptionFull()) || '').trim();
    const descriptionLowercase = description.toLowerCase();

    if (!this._isGeneratedByPrAgent(descriptionLowercase)) {
      this._userDescription = description;
      return description;
    }

    const userDescriptionHeader = '### **user description**';
    if (!descriptionLowercase.includes(userDescriptionHeader)) {
      return '';
    }

    const possibleHeaders = this._possibleHeaders();
    const startPosition = descriptionLowercase.indexOf(userDescriptionHeader) + userDescriptionHeader.length;
    let endPosition = description.length;

    for (const header of possibleHeaders) {
      if (header !== userDescriptionHeader && descriptionLowercase.includes(header)) {
        endPosition = Math.min(endPosition, descriptionLowercase.indexOf(header));
      }
    }

    let originalUserDescription: string;
    if (endPosition !== description.length && endPosition > startPosition) {
      originalUserDescription = description.slice(startPosition, endPosition).trim();
      if (originalUserDescription.endsWith('___')) {
        originalUserDescription = originalUserDescription.slice(0, -3).trim();
      }
    } else {
      originalUserDescription = description.split('___')[0].trim();
      if (originalUserDescription.toLowerCase().startsWith(userDescriptionHeader)) {
        originalUserDescription = originalUserDescription.slice(userDescriptionHeader.length).trim();
      }
    }

    this._userDescription = originalUserDescription;
    return originalUserDescription;
  }

  protected _possibleHeaders(): string[] {
    return [
      '### **user description**',
      '### **pr type**',
      '### **pr description**',
      '### **pr labels**',
      '### **type**',
      '### **description**',
      '### **labels**',
      '### 🤖 generated by pr agent',
    ];
  }

  protected _isGeneratedByPrAgent(descriptionLowercase: string): boolean {
    const possibleHeaders = this._possibleHeaders();
    return possibleHeaders.some((header) => descriptionLowercase.startsWith(header));
  }

  abstract getRepoSettings(): Promise<string | Uint8Array | null>;

  getWorkspaceName(): string {
    return '';
  }

  getPrId(): string {
    return '';
  }

  getLineLink(_relevantFile: string, _relevantLineStart: number, _relevantLineEnd?: number): string {
    return '';
  }

  getLinesLinkOriginalFile(_filepath: string, _componentRange: Range): string {
    return '';
  }

  // ---- comment operations ----

  abstract publishComment(prComment: string, isTemporary?: boolean): Promise<unknown>;

  async publishPersistentComment(
    prComment: string,
    _initialHeader: string,
    _updateHeader: boolean = true,
    _name: string = 'review',
    _finalUpdateMessage: boolean = true,
  ): Promise<unknown> {
    return this.publishComment(prComment);
  }

  async publishPersistentCommentFull(
    prComment: string,
    initialHeader: string,
    updateHeader: boolean = true,
    name: string = 'review',
    finalUpdateMessage: boolean = true,
  ): Promise<unknown> {
    try {
      const prevComments = (await this.getIssueComments()) as { body?: string }[];
      for (const comment of prevComments) {
        if (comment.body?.startsWith(initialHeader)) {
          const latestCommitUrl = this.getLatestCommitUrl();
          const commentUrl = this.getCommentUrl(comment);
          let prCommentUpdated = prComment;
          if (updateHeader) {
            const updatedHeader = `${initialHeader}\n\n#### (${name.charAt(0).toUpperCase() + name.slice(1)} updated until commit ${latestCommitUrl})\n`;
            prCommentUpdated = prComment.replace(initialHeader, updatedHeader);
          }
          await this.editComment(comment, prCommentUpdated);
          if (finalUpdateMessage) {
            return this.publishComment(
              `**[Persistent ${name}](${commentUrl})** updated to latest commit ${latestCommitUrl}`,
            );
          }
          return comment;
        }
      }
    } catch (e) {
      console.error('Failed to update persistent review', { error: String(e) });
    }
    return this.publishComment(prComment);
  }

  abstract publishInlineComment(
    body: string,
    relevantFile: string,
    relevantLineInFile: string,
    originalSuggestion?: Record<string, unknown>,
  ): Promise<void>;

  createInlineComment(
    _body: string,
    _relevantFile: string,
    _relevantLineInFile: string,
    _absolutePosition?: number,
  ): Record<string, unknown> {
    throw new Error('This git provider does not support creating inline comments yet');
  }

  abstract publishInlineComments(comments: Record<string, unknown>[]): Promise<void>;

  abstract removeInitialComment(): Promise<void>;

  abstract removeComment(comment: unknown): Promise<void>;

  abstract getIssueComments(): Promise<unknown[]>;

  getCommentUrl(_comment: unknown): string {
    return '';
  }

  getReviewThreadComments(_commentId: number): Promise<Record<string, unknown>[]> {
    return Promise.resolve([]);
  }

  // ---- labels ----

  abstract publishLabels(labels: string[]): Promise<void>;

  abstract getPrLabels(update?: boolean): Promise<string[]>;

  async getRepoLabels(): Promise<unknown[]> {
    return [];
  }

  abstract addEyesReaction(
    issueCommentId: number,
    disableEyes?: boolean,
  ): Promise<number | null>;

  abstract removeReaction(issueCommentId: number, reactionId: number | string): Promise<boolean>;

  // ---- commits ----

  abstract getCommitMessages(): Promise<string>;

  getPrUrl(): string {
    return (this as Record<string, unknown>).prUrl as string ?? '';
  }

  getLatestCommitUrl(): string {
    return '';
  }

  async autoApprove(): Promise<boolean> {
    return false;
  }

  async calcPrStatistics(_pullRequestData: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }

  getNumOfFiles(): number {
    try {
      return this.getDiffFiles().length;
    } catch {
      return -1;
    }
  }

  limitOutputCharacters(output: string, maxChars: number): string {
    if (output.length > maxChars) {
      return output.slice(0, maxChars) + '...';
    }
    return output;
  }
}

export function getMainPrLanguage(
  languages: Record<string, number>,
  files: (string | FilePatchInfo)[],
): string {
  if (!languages || Object.keys(languages).length === 0) {
    return '';
  }
  if (!files || files.length === 0) {
    return '';
  }

  try {
    const topLanguage = Object.entries(languages).sort((a, b) => b[1] - a[1])[0][0].toLowerCase();

    const extensionList: string[] = [];
    for (const file of files) {
      if (!file) continue;
      if (typeof file === 'string') {
        extensionList.push(file.split('.').pop() ?? '');
      } else {
        extensionList.push((file as FilePatchInfo).filename.split('.').pop() ?? '');
      }
    }

    const mostCommonExtension = '.' + extensionList.sort((a, b) =>
      extensionList.filter((v) => v === a).length - extensionList.filter((v) => v === b).length,
    ).pop();

    try {
      const languageExtensionMap: Record<string, string[]> = {
        python: ['.py'],
        javascript: ['.js', '.jsx'],
        typescript: ['.ts', '.tsx'],
        go: ['.go'],
        java: ['.java'],
        rust: ['.rs'],
        'c++': ['.cpp', '.cc', '.cxx'],
        c: ['.c'],
        'c#': ['.cs'],
        php: ['.php'],
        ruby: ['.rb'],
        swift: ['.swift'],
        kotlin: ['.kt'],
        scala: ['.scala'],
        perl: ['.pl'],
      };

      if (
        languageExtensionMap[topLanguage] &&
        languageExtensionMap[topLanguage].includes(mostCommonExtension)
      ) {
        return topLanguage;
      }

      for (const [lang, exts] of Object.entries(languageExtensionMap)) {
        if (exts.includes(mostCommonExtension)) {
          return lang;
        }
      }
    } catch {
      // fall through
    }
  } catch {
    // ignore
  }

  return '';
}

async function processDescription(
  _description: string,
): Promise<[string, unknown[]]> {
  return [_description, []];
}

export class IncrementalPR {
  isIncremental: boolean;
  commitsRange: unknown[] | null;
  firstNewCommit: { sha: string } | null;
  lastSeenCommit: { sha: string } | null;

  constructor(isIncremental: boolean = false) {
    this.isIncremental = isIncremental;
    this.commitsRange = null;
    this.firstNewCommit = null;
    this.lastSeenCommit = null;
  }

  get firstNewCommitSha(): string | null {
    return this.firstNewCommit?.sha ?? null;
  }

  get lastSeenCommitSha(): string | null {
    return this.lastSeenCommit?.sha ?? null;
  }
}
