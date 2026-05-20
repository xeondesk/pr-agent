interface CodeCommitDifferencesResponse {
  beforeBlobId: string;
  beforeBlobPath: string;
  afterBlobId: string;
  afterBlobPath: string;
  changeType: string;
}

interface CodeCommitPullRequestTarget {
  sourceCommit: string;
  sourceBranch: string;
  destinationCommit: string;
  destinationBranch: string;
}

interface CodeCommitPullRequestResponse {
  title: string;
  description: string;
  targets: CodeCommitPullRequestTarget[];
}

export class CodeCommitClient {
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private sessionToken: string | null;

  constructor() {
    this.region = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1';
    this.accessKeyId = process.env['AWS_ACCESS_KEY_ID'] || '';
    this.secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] || '';
    this.sessionToken = process.env['AWS_SESSION_TOKEN'] || null;
  }

  private async _signAndFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    const host = `codecommit.${this.region}.amazonaws.com`;
    const url = `https://${host}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCodeCommit_20150413.${path.split('/').pop() || this._getTarget(method, path)}`,
    };

    // Simple auth header for AWS API
    const dateStr = new Date().toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
    headers['X-Amz-Date'] = dateStr;
    if (this.sessionToken) {
      headers['X-Amz-Security-Token'] = this.sessionToken;
    }

    // In a full implementation, this would use AWS Signature V4
    // For now, use a simplified approach
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        'Authorization': `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${this._getDateStr()}/${this.region}/codecommit/aws4_request`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`CodeCommit API error: ${response.status}\n${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  private _getDateStr(): string {
    return new Date().toISOString().split('T')[0].replace(/-/g, '');
  }

  private _getTarget(_method: string, _path: string): string {
    return 'CodeCommit_20150413';
  }

  async getDifferences(
    repoName: string,
    destinationCommit: string,
    sourceCommit: string,
  ): Promise<CodeCommitDifferencesResponse[]> {
    const differences: CodeCommitDifferencesResponse[] = [];
    let nextToken: string | undefined;

    do {
      const body: Record<string, unknown> = {
        repositoryName: repoName,
        beforeCommitSpecifier: destinationCommit,
        afterCommitSpecifier: sourceCommit,
      };
      if (nextToken) body['NextToken'] = nextToken;

      const response = await this._signAndFetch<{
        differences?: {
          beforeBlob?: { blobId?: string; path?: string };
          afterBlob?: { blobId?: string; path?: string };
          changeType?: string;
        }[];
        nextToken?: string;
      }>('POST', '/', body);

      for (const diff of response.differences || []) {
        differences.push({
          beforeBlobId: diff.beforeBlob?.blobId || '',
          beforeBlobPath: diff.beforeBlob?.path || '',
          afterBlobId: diff.afterBlob?.blobId || '',
          afterBlobPath: diff.afterBlob?.path || '',
          changeType: diff.changeType || '',
        });
      }

      nextToken = response.nextToken;
    } while (nextToken);

    return differences;
  }

  async getFile(repoName: string, filePath: string, shaHash: string, optional: boolean = false): Promise<string> {
    if (!filePath) return '';

    try {
      const response = await this._signAndFetch<{
        fileContent?: string;
        fileContentBase64?: string;
      }>('POST', '/', {
        repositoryName: repoName,
        commitSpecifier: shaHash,
        filePath,
      });

      if (response.fileContentBase64) {
        return Buffer.from(response.fileContentBase64, 'base64').toString('utf-8');
      }
      if (response.fileContent) {
        return response.fileContent;
      }
      return '';
    } catch (e) {
      if (optional) return '';
      throw e;
    }
  }

  async getPr(repoName: string, prNumber: number): Promise<CodeCommitPullRequestResponse> {
    const response = await this._signAndFetch<{
      pullRequest?: {
        title?: string;
        description?: string;
        pullRequestTargets?: {
          sourceCommit?: string;
          sourceReference?: string;
          destinationCommit?: string;
          destinationReference?: string;
        }[];
      };
    }>('POST', '/', {
      pullRequestId: String(prNumber),
    });

    if (!response.pullRequest) {
      throw new Error(`CodeCommit PR number not found: ${prNumber}`);
    }

    const pr = response.pullRequest;
    const targets = (pr.pullRequestTargets || []).map((t) => ({
      sourceCommit: t.sourceCommit || '',
      sourceBranch: t.sourceReference || '',
      destinationCommit: t.destinationCommit || '',
      destinationBranch: t.destinationReference || '',
    }));

    return {
      title: pr.title || '',
      description: pr.description || '',
      targets,
    };
  }

  async publishDescription(prNumber: number, prTitle: string, prBody: string): Promise<void> {
    await this._signAndFetch('POST', '/', {
      pullRequestId: String(prNumber),
      title: prTitle,
    });
    await this._signAndFetch('POST', '/', {
      pullRequestId: String(prNumber),
      description: prBody,
    });
  }

  async publishComment(
    repoName: string,
    prNumber: number,
    destinationCommit: string,
    sourceCommit: string,
    comment: string,
    annotationFile?: string,
    annotationLine?: number,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      pullRequestId: String(prNumber),
      repositoryName: repoName,
      beforeCommitId: destinationCommit,
      afterCommitId: sourceCommit,
      content: comment,
    };

    if (annotationFile && annotationLine) {
      body['location'] = {
        filePath: annotationFile,
        filePosition: annotationLine,
        relativeFileVersion: 'AFTER',
      };
    }

    await this._signAndFetch('POST', '/', body);
  }
}
