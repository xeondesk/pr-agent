import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { GitProvider } from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo } from '@pr-agent/types';

class PullRequestMimic {
  title: string;
  diffFiles: FilePatchInfo[];

  constructor(title: string, diffFiles: FilePatchInfo[]) {
    this.title = title;
    this.diffFiles = diffFiles;
  }
}

export class LocalGitProvider extends GitProvider {
  repoPath: string;
  headBranchName: string;
  targetBranchName: string;
  diffFiles: FilePatchInfo[] | null = null;
  pr: PullRequestMimic;
  descriptionPath: string;
  reviewPath: string;

  constructor(targetBranchName: string) {
    super();
    const root = this._findRepositoryRoot();
    if (!root) {
      throw new Error('Could not find repository root');
    }
    this.repoPath = root;

    const ref = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.repoPath, encoding: 'utf-8' }).trim();
    this.headBranchName = ref;
    this.targetBranchName = targetBranchName;

    this._prepareRepo();

    this.diffFiles = [];
    this.pr = new PullRequestMimic(this._getPrTitle(), this.getDiffFiles());
    this.descriptionPath = process.env['LOCAL_DESCRIPTION_PATH'] || join(this.repoPath, 'description.md');
    this.reviewPath = process.env['LOCAL_REVIEW_PATH'] || join(this.repoPath, 'review.md');
  }

  private _findRepositoryRoot(): string | null {
    try {
      const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
      return root;
    } catch {
      return null;
    }
  }

  private _prepareRepo(): void {
    const status = execSync('git status --porcelain', { cwd: this.repoPath, encoding: 'utf-8' }).trim();
    if (status) {
      throw new Error('The repository is not in a clean state. Please commit or stash pending changes.');
    }

    try {
      execSync(`git rev-parse --verify ${this.targetBranchName}`, { cwd: this.repoPath, stdio: 'ignore' });
    } catch {
      throw new Error(`Branch: ${this.targetBranchName} does not exist`);
    }
  }

  private _getPrTitle(): string {
    return this.headBranchName;
  }

  isSupported(capability: string): boolean {
    if (['get_issue_comments', 'create_inline_comment', 'publish_inline_comments', 'get_labels', 'gfm_markdown'].includes(capability)) {
      return false;
    }
    return true;
  }

  setPr(_prUrl: string): void {
    // Not used for local provider
  }

  getFiles(): string[] {
    try {
      const stdout = execSync(
        `git diff --name-only ${this.targetBranchName}...HEAD`,
        { cwd: this.repoPath, encoding: 'utf-8' },
      );
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  getDiffFiles(): FilePatchInfo[] {
    if (this.diffFiles) return this.diffFiles;

    try {
      const mergeBase = execSync(
        `git merge-base HEAD ${this.targetBranchName}`,
        { cwd: this.repoPath, encoding: 'utf-8' },
      ).trim();

      const nameStatusStdout = execSync(
        `git diff --name-status ${mergeBase} HEAD --diff-filter=AMDR`,
        { cwd: this.repoPath, encoding: 'utf-8' },
      );

      const files: FilePatchInfo[] = [];
      const lines = nameStatusStdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.split('\t');
        const status = parts[0];
        const path = parts[parts.length - 1];
        if (!path) continue;

        let editType: EDIT_TYPE;
        switch (status) {
          case 'A': editType = EDIT_TYPE.ADDED; break;
          case 'D': editType = EDIT_TYPE.DELETED; break;
          case 'R': editType = EDIT_TYPE.RENAMED; break;
          default: editType = EDIT_TYPE.MODIFIED;
        }

        let baseFile = '';
        let headFile = '';
        try { baseFile = execSync(`git show ${mergeBase}:${path}`, { cwd: this.repoPath, encoding: 'utf-8' }); } catch { /* new file */ }
        try { headFile = execSync(`git show HEAD:${path}`, { cwd: this.repoPath, encoding: 'utf-8' }); } catch { /* deleted file */ }

        const diffStdout = execSync(`git diff ${mergeBase} HEAD -- "${path}"`, { cwd: this.repoPath, encoding: 'utf-8' });

        files.push({
          base_file: baseFile,
          head_file: headFile,
          patch: diffStdout,
          filename: path,
          edit_type: editType,
        });
      }

      this.diffFiles = files;
      return files;
    } catch (e) {
      console.error('Failed to get diff files', { error: String(e) });
      return [];
    }
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    writeFileSync(this.descriptionPath, prTitle + '\n' + prBody);
  }

  async publishLabels(_labels: string[]): Promise<void> {
    // Not applicable
  }

  async publishCodeSuggestions(_codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    throw new Error('Publishing code suggestions is not implemented for the local git provider');
  }

  async publishComment(prComment: string, _isTemporary?: boolean): Promise<void> {
    writeFileSync(this.reviewPath, prComment);
  }

  async publishInlineComment(_body: string, _relevantFile: string, _relevantLineInFile: string, _originalSuggestion?: Record<string, unknown>): Promise<void> {
    throw new Error('Publishing inline comments is not implemented for the local git provider');
  }

  async publishInlineComments(_comments: Record<string, unknown>[]): Promise<void> {
    throw new Error('Publishing inline comments is not implemented for the local git provider');
  }

  async removeInitialComment(): Promise<void> {
    // Not applicable
  }

  async removeComment(_comment: unknown): Promise<void> {
    // Not applicable
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

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    return null;
  }

  async getLanguages(): Promise<Record<string, number>> {
    try {
      const stdout = execSync('git ls-files', { cwd: this.repoPath, encoding: 'utf-8' });
      const files = stdout.trim().split('\n').filter(Boolean);
      const extCount: Record<string, number> = {};
      for (const file of files) {
        const ext = file.split('.').pop()?.toLowerCase() || '';
        if (ext) extCount[ext] = (extCount[ext] || 0) + 1;
      }
      const total = Object.values(extCount).reduce((a, b) => a + b, 0);
      if (total === 0) return {};
      const percentages: Record<string, number> = {};
      for (const [ext, count] of Object.entries(extCount)) {
        percentages[ext] = (count / total) * 100;
      }
      return percentages;
    } catch {
      return {};
    }
  }

  getPrBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.repoPath, encoding: 'utf-8' }).trim();
    } catch {
      return '';
    }
  }

  async getPrDescriptionFull(): Promise<string> {
    const stdout = execSync(
      `git log ${this.targetBranchName}..HEAD --format=%B`,
      { cwd: this.repoPath, encoding: 'utf-8' },
    );
    return stdout.trim().slice(0, 200);
  }

  async getUserId(): Promise<string | number | null> {
    return -1;
  }

  async getIssueComments(): Promise<unknown[]> {
    throw new Error('Getting issue comments is not implemented for the local git provider');
  }

  async getPrLabels(_update?: boolean): Promise<string[]> {
    throw new Error('Getting labels is not implemented for the local git provider');
  }
}
