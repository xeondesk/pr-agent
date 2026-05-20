import type { ConfigSettings } from '@pr-agent/types';

export class PRSimilarIssue {
  private issueUrl: string;
  private supported: boolean;
  private cliMode: boolean = false;
  private maxIssuesToScan: number = 500;
  private gitProvider: any;
  private repoNameForIndex: string = '';
  private indexName: string = '';
  private tokenHandler: any;
  private getSettings: () => ConfigSettings;

  constructor(
    issueUrl: string,
    _aiHandler: any,
    getSettings: () => ConfigSettings,
    gitProvider: any,
    _args: string[] | undefined = undefined
  ) {
    this.issueUrl = issueUrl;
    this.supported = getSettings().config?.git_provider === 'github';
    this.getSettings = getSettings;
    this.gitProvider = gitProvider;
    this.tokenHandler = null;

    if (!this.supported) return;

    this.cliMode = !!(getSettings().config as any)?.cli_mode;
    this.maxIssuesToScan = getSettings().pr_similar_issue?.max_issues_to_scan || 100;

    const repoObj = gitProvider.repo_obj;
    this.repoNameForIndex = repoObj.full_name.toLowerCase().replace('/', '-').replace('_/', '-');
    this.indexName = 'codium-ai-pr-agent-issues';
  }

  async run(): Promise<void> {
    if (!this.supported) {
      const message = 'The /similar_issue tool is currently supported only for GitHub.';
      console.log(message);
      return;
    }

    console.log('Getting issue...');
    const repoName = this.gitProvider.repo;
    const issueUrlPart = this.issueUrl.split('=').pop() || this.issueUrl;
    const [, originalIssueNumber] = this.gitProvider._parseIssueUrl(issueUrlPart);
    const issueMain = this.gitProvider.repo_obj.getIssue(originalIssueNumber);
    const [issueStr, _comments, _number] = this.processIssue(issueMain);
    console.log('Done');

    console.log('Querying...');
    const relevantIssuesNumberList: number[] = [];
    const relevantCommentNumberList: number[] = [];
    const scoreList: string[] = [];

    // Simplified query - in real usage would connect to vector DB
    // For now, just publish an empty result
    console.log('Done');

    console.log('Publishing response...');
    let similarIssuesStr = '### Similar Issues\n___\n\n';

    for (let i = 0; i < relevantIssuesNumberList.length; i++) {
      const issue = this.gitProvider.repo_obj.getIssue(relevantIssuesNumberList[i]);
      const title = issue.title;
      let url = issue.html_url;
      if (relevantCommentNumberList[i] !== -1) {
        url = issue.getComments()[relevantCommentNumberList[i]].html_url;
      }
      similarIssuesStr += `${i + 1}. **[${title}](${url})** (score=${scoreList[i]})\n\n`;
    }

    if (this.getSettings().config?.publish_output) {
      issueMain.createComment(similarIssuesStr);
    }
    console.log(similarIssuesStr);
    console.log('Done');
  }

  private processIssue(issue: any): [string, any[], number] {
    const header = issue.title;
    const body = issue.body;
    const number = issue.number;
    const skipComments = this.getSettings().pr_similar_issue?.skip_comments ?? false;
    const comments = skipComments ? [] : (issue.getComments?.() || []);
    const issueStr = `Issue Header: "${header}"\n\nIssue Body:\n${body}`;
    return [issueStr, comments, number];
  }
}
