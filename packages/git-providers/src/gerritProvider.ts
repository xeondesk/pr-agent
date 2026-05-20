import { execSync, spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { URL } from 'url';
import { GitProvider } from './gitProvider.js';
import { EDIT_TYPE, FilePatchInfo } from '@pr-agent/types';

export class GerritProvider extends GitProvider {
  project: string;
  refspec: string;
  private _baseUrl: string;
  private _user: string;
  private _port: string;
  private _host: string;
  repoPath: string;
  prData: Record<string, unknown>;

  constructor(key: string) {
    super();
    const [project, refspec] = key.split(':');
    if (!project) throw new Error('Project name is required');
    if (!refspec) throw new Error('Refspec is required');
    this.project = project;
    this.refspec = refspec;

    this._baseUrl = process.env['GERRIT_URL'] || '';
    this._user = process.env['GERRIT_USER'] || '';
    if (!this._baseUrl) throw new Error('Gerrit URL is required. Set GERRIT_URL.');
    if (!this._user) throw new Error('Gerrit user is required. Set GERRIT_USER.');

    const parsed = new URL(this._baseUrl);
    this._host = parsed.hostname;
    this._port = parsed.port || '29418';

    this.repoPath = this._prepareRepo();
    this.prData = { title: this._getPrTitle() };
  }

  private _call(cmd: string, args: string[], cwd?: string): string {
    const result = spawnSync(cmd, args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 30000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Command failed: ${result.stderr}`);
    return result.stdout;
  }

  private _prepareRepo(): string {
    const repoUrl = `${this._baseUrl.split('://')[0]}://${this._user}@${this._host}:${this._port}/${this.project}`;
    const directory = mkdtempSync(join(tmpdir(), 'gerrit-'));

    execSync(`git clone --depth 1 "${repoUrl}" "${directory}"`, { stdio: 'ignore', timeout: 30000 });
    execSync(`git fetch --depth 2 "${repoUrl}" "${this.refspec}"`, { cwd: directory, stdio: 'ignore', timeout: 30000 });
    execSync('git checkout FETCH_HEAD', { cwd: directory, stdio: 'ignore', timeout: 30000 });

    return directory;
  }

  private _sshCommand(args: string[]): string {
    const result = spawnSync('ssh', [
      '-p', this._port,
      `${this._user}@${this._host}`,
      ...args,
    ], {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 30000,
    });
    if (result.error) throw result.error;
    return result.stdout;
  }

  isSupported(capability: string): boolean {
    if (['create_inline_comment', 'publish_inline_comments', 'get_labels', 'gfm_markdown'].includes(capability)) {
      return false;
    }
    return true;
  }

  setPr(_prUrl: string): void {
    // Not used for Gerrit
  }

  private _getPrTitle(): string {
    try {
      const stdout = execSync('git branch', { cwd: this.repoPath, encoding: 'utf-8' });
      const current = stdout.split('\n').find((b: string) => b.startsWith('* '));
      return current?.replace('* ', '') || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async getIssueComments(): Promise<unknown[]> {
    const parts = this.refspec.split('/');
    const patchset = parts[parts.length - 2];
    const stdout = this._sshCommand([
      'gerrit', 'query',
      '--comments',
      '--current-patch-set', patchset,
      '--format', 'JSON',
    ]);
    const lines = stdout.trim().split('\n');
    const data = JSON.parse(lines[0]);
    const comments = data?.currentPatchSet?.comments || [];
    return comments.reverse().map((c: { message: string }) => ({ body: c.message }));
  }

  async getPrLabels(_update?: boolean): Promise<string[]> {
    throw new Error('Getting labels is not implemented for the gerrit provider');
  }

  async addEyesReaction(_issueCommentId: number, _disableEyes?: boolean): Promise<number | null> {
    throw new Error('Adding reactions is not implemented for the gerrit provider');
  }

  async removeReaction(_issueCommentId: number, _reactionId: number | string): Promise<boolean> {
    throw new Error('Removing reactions is not implemented for the gerrit provider');
  }

  async getCommitMessages(): Promise<string> {
    try {
      const msg = execSync('git log -1 --format=%s', { cwd: this.repoPath, encoding: 'utf-8' });
      return msg.trim();
    } catch {
      return '';
    }
  }

  async getRepoSettings(): Promise<string | Uint8Array | null> {
    try {
      return readFileSync(join(this.repoPath, '.pr_agent.toml'));
    } catch {
      return null;
    }
  }

  async publishDescription(prTitle: string, prBody: string): Promise<void> {
    const msg = this._adoptToGerritMessage(prBody);
    this._addComment(prTitle + '\n' + msg);
  }

  async publishLabels(_labels: string[]): Promise<void> {
    // Not applicable
  }

  async publishCodeSuggestions(_codeSuggestions: Record<string, unknown>[]): Promise<boolean> {
    return false;
  }

  getFiles(): string[] {
    try {
      const stdout = execSync('git diff --name-only HEAD~1 HEAD', { cwd: this.repoPath, encoding: 'utf-8' });
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  getDiffFiles(): FilePatchInfo[] {
    try {
      const nameStatus = execSync('git diff --name-status HEAD~1 HEAD', { cwd: this.repoPath, encoding: 'utf-8' });
      const files: FilePatchInfo[] = [];
      const lines = nameStatus.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [status, path] = line.split('\t');
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
        try { baseFile = execSync(`git show HEAD~1:${path}`, { cwd: this.repoPath, encoding: 'utf-8' }); } catch { /* ok */ }
        try { headFile = execSync(`git show HEAD:${path}`, { cwd: this.repoPath, encoding: 'utf-8' }); } catch { /* ok */ }

        const diffStdout = execSync(`git diff HEAD~1 HEAD -- "${path}"`, { cwd: this.repoPath, encoding: 'utf-8' });

        files.push({
          base_file: baseFile,
          head_file: headFile,
          patch: diffStdout,
          filename: path,
          edit_type: editType,
        });
      }
      return files;
    } catch (e) {
      console.error('Failed to get diff files', { error: String(e) });
      return [];
    }
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
      const pct: Record<string, number> = {};
      for (const [ext, count] of Object.entries(extCount)) {
        pct[ext] = (count / total) * 100;
      }
      return pct;
    } catch {
      return {};
    }
  }

  async getPrDescriptionFull(): Promise<string> {
    try {
      return execSync('git log -1 --format=%B', { cwd: this.repoPath, encoding: 'utf-8' });
    } catch {
      return '';
    }
  }

  async getUserId(): Promise<string | null> {
    try {
      return execSync('git log -1 --format=%ae', { cwd: this.repoPath, encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  }

  async publishComment(prComment: string, isTemporary: boolean = false): Promise<void> {
    if (!isTemporary) {
      this._addComment(this._adoptToGerritMessage(prComment));
    }
  }

  async publishInlineComment(_body: string, _relevantFile: string, _relevantLineInFile: string, _originalSuggestion?: Record<string, unknown>): Promise<void> {
    throw new Error('Publishing inline comments is not implemented for the gerrit provider');
  }

  async publishInlineComments(_comments: Record<string, unknown>[]): Promise<void> {
    throw new Error('Publishing inline comments is not implemented for the gerrit provider');
  }

  async removeInitialComment(): Promise<void> {
    // Not applicable
  }

  async removeComment(_comment: unknown): Promise<void> {
    // Not applicable
  }

  getPrBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.repoPath, encoding: 'utf-8' }).trim();
    } catch {
      return '';
    }
  }

  private _addComment(message: string): void {
    const parts = this.refspec.split('/');
    const patchset = parts[parts.length - 2];
    const changenum = parts[parts.length - 1];
    const safeMsg = message.replace(/'/g, "'\"'\"'");
    this._sshCommand(['gerrit', 'review', '--message', `'${safeMsg}'`, `${patchset},${changenum}`]);
  }

  private _adoptToGerritMessage(message: string): string {
    const lines = message.split('\n');
    const buf: string[] = [];
    for (const line of lines) {
      let l = line
        .replace(/\*/g, '')
        .replace(/``/g, '`')
        .replace(/<details>/g, '')
        .replace(/<\/details>/g, '')
        .replace(/<summary>/g, '')
        .replace(/<\/summary>/g, '')
        .trim();
      if (l.startsWith('#')) {
        buf.push('\n' + l.replace(/#/g, '').replace(/:$/, '').trim() + ':');
      } else if (l.startsWith('-')) {
        buf.push(l.replace(/^-/, '').trim());
      } else {
        buf.push(l);
      }
    }
    return buf.join('\n').trim();
  }
}
