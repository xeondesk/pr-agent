import type { ConfigSettings } from '@pr-agent/types';

const GITHUB_TICKET_PATTERN = /(https:\/\/github[^/]+\/[^/]+\/[^/]+\/issues\/\d+)|(\b(\w+)\/(\w+)#(\d+)\b)|(#\d+)/g;
const BRANCH_ISSUE_PATTERN = /(?:^|\/)(\d{1,6})(?=-|$)/g;

export function findJiraTickets(text: string): string[] {
  const patterns = [
    /\b[A-Z]{2,10}-\d{1,7}\b/g,
    /(?:https?:\/\/[^\s/]+\/browse\/)?([A-Z]{2,10}-\d{1,7})\b/g,
  ];

  const tickets = new Set<string>();
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const ticket = match[1] || match[0];
      if (ticket) {
        tickets.add(ticket);
      }
    }
  }

  return Array.from(tickets);
}

export function extractTicketLinksFromPrDescription(
  prDescription: string,
  repoPath: string,
  baseUrlHtml: string = 'https://github.com'
): string[] {
  const githubTickets = new Set<string>();

  try {
    let match: RegExpExecArray | null;
    GITHUB_TICKET_PATTERN.lastIndex = 0;
    while ((match = GITHUB_TICKET_PATTERN.exec(prDescription)) !== null) {
      if (match[1]) {
        githubTickets.add(match[1]);
      } else if (match[2]) {
        const owner = match[3];
        const repo = match[4];
        const issueNumber = match[5];
        githubTickets.add(`${baseUrlHtml.replace(/\/+$/, '')}/${owner}/${repo}/issues/${issueNumber}`);
      } else if (match[6]) {
        const issueNumber = match[6].slice(1);
        if (/^\d+$/.test(issueNumber) && issueNumber.length < 5 && repoPath) {
          githubTickets.add(`${baseUrlHtml.replace(/\/+$/, '')}/${repoPath}/issues/${issueNumber}`);
        }
      }
    }

    if (githubTickets.size > 3) {
      console.log(`Too many tickets found in PR description: ${githubTickets.size}`);
      return Array.from(githubTickets).slice(0, 3);
    }
  } catch (e: any) {
    console.error(`Error extracting tickets error: ${e.message}`);
  }

  return Array.from(githubTickets);
}

export function extractTicketLinksFromBranchName(
  branchName: string,
  repoPath: string,
  baseUrlHtml: string = 'https://github.com'
): string[] {
  if (!branchName || !repoPath) return [];
  if (typeof branchName !== 'string') return [];

  const extractFromBranch = true;
  if (!extractFromBranch) return [];

  const githubTickets = new Set<string>();
  BRANCH_ISSUE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BRANCH_ISSUE_PATTERN.exec(branchName)) !== null) {
    const issueNumber = match[1];
    if (issueNumber && /^\d+$/.test(issueNumber)) {
      githubTickets.add(
        `${baseUrlHtml.replace(/\/+$/, '')}/${repoPath}/issues/${issueNumber}`
      );
    }
  }

  return Array.from(githubTickets);
}

export async function extractTickets(gitProvider: any): Promise<any[]> {
  const MAX_TICKET_CHARACTERS = 10000;

  try {
    const providerName = gitProvider.constructor?.name;

    if (providerName === 'GithubProvider' || providerName?.includes('Github')) {
      const userDescription = gitProvider.getUserDescription();
      const descriptionTickets = extractTicketLinksFromPrDescription(
        userDescription,
        gitProvider.repo,
        gitProvider.base_url_html
      );
      const branchName = gitProvider.getPrBranch();
      const branchTickets = extractTicketLinksFromBranchName(
        branchName,
        gitProvider.repo,
        gitProvider.base_url_html
      );

      const seen = new Set<string>();
      const merged: string[] = [];
      for (const link of [...descriptionTickets, ...branchTickets]) {
        if (!seen.has(link)) {
          seen.add(link);
          merged.push(link);
        }
      }

      const tickets = merged.length > 3 ? merged.slice(0, 3) : merged;
      const ticketsContent: any[] = [];

      if (tickets.length > 0) {
        for (const ticket of tickets) {
          const [_repoName, originalIssueNumber] = gitProvider._parseIssueUrl(ticket);

          try {
            const issueMain = gitProvider.repo_obj.getIssue(originalIssueNumber);
            let issueBodyStr = issueMain.body || '';
            if (issueBodyStr.length > MAX_TICKET_CHARACTERS) {
              issueBodyStr = issueBodyStr.slice(0, MAX_TICKET_CHARACTERS) + '...';
            }

            const subIssuesContent: any[] = [];
            try {
              const subIssues = gitProvider.fetchSubIssues(ticket);
              for (const subIssueUrl of subIssues) {
                try {
                  const [_subRepo, subIssueNumber] = gitProvider._parseIssueUrl(subIssueUrl);
                  const subIssue = gitProvider.repo_obj.getIssue(subIssueNumber);
                  let subBody = subIssue.body || '';
                  if (subBody.length > MAX_TICKET_CHARACTERS) {
                    subBody = subBody.slice(0, MAX_TICKET_CHARACTERS) + '...';
                  }
                  subIssuesContent.push({
                    ticket_url: subIssueUrl,
                    title: subIssue.title,
                    body: subBody,
                  });
                } catch (e: any) {
                  console.warn(`Failed to fetch sub-issue content for ${subIssueUrl}: ${e.message}`);
                }
              }
            } catch (e: any) {
              console.warn(`Failed to fetch sub-issues for ${ticket}: ${e.message}`);
            }

            const labels: string[] = [];
            try {
              for (const label of issueMain.labels || []) {
                labels.push(label.name || label);
              }
            } catch (e: any) {
              console.error(`Error extracting labels: ${e.message}`);
            }

            ticketsContent.push({
              ticket_id: issueMain.number,
              ticket_url: ticket,
              title: issueMain.title,
              body: issueBodyStr,
              labels: labels.join(', '),
              sub_issues: subIssuesContent,
            });
          } catch (e: any) {
            console.error(`Error getting main issue: ${e.message}`);
            continue;
          }
        }

        return ticketsContent;
      }
    } else if (providerName === 'AzureDevopsProvider' || providerName?.includes('AzureDevops')) {
      const ticketsInfo = gitProvider.getLinkedWorkItems();
      const ticketsContent: any[] = [];

      for (const ticket of ticketsInfo) {
        try {
          let ticketBodyStr = ticket.body || '';
          if (ticketBodyStr.length > MAX_TICKET_CHARACTERS) {
            ticketBodyStr = ticketBodyStr.slice(0, MAX_TICKET_CHARACTERS) + '...';
          }

          ticketsContent.push({
            ticket_id: ticket.id,
            ticket_url: ticket.url,
            title: ticket.title,
            body: ticketBodyStr,
            requirements: ticket.acceptance_criteria || '',
            labels: (ticket.labels || []).join(', '),
          });
        } catch (e: any) {
          console.error(`Error processing Azure DevOps ticket: ${e.message}`);
        }
      }

      return ticketsContent;
    }
  } catch (e: any) {
    console.error(`Error extracting tickets: ${e.message}`);
  }

  return [];
}

export async function extractAndCachePrTickets(
  gitProvider: any,
  vars: Record<string, unknown>,
  getSettings: () => ConfigSettings
): Promise<void> {
  const s = getSettings();
  if (!(s as any).pr_reviewer?.require_ticket_analysis_review) return;

  let relatedTickets: any[] = (s as any).related_tickets || [];

  if (relatedTickets.length === 0) {
    const ticketsContent = await extractTickets(gitProvider);

    if (ticketsContent && ticketsContent.length > 0) {
      for (const ticket of ticketsContent) {
        if (ticket.sub_issues && ticket.sub_issues.length > 0) {
          for (const subIssue of ticket.sub_issues) {
            relatedTickets.push(subIssue);
          }
        }
        relatedTickets.push(ticket);
      }

      console.log('Extracted tickets and sub-issues from PR description', { tickets: relatedTickets });
      vars.relatedTickets = relatedTickets;
    }
  } else {
    console.log('Using cached tickets', { tickets: relatedTickets });
    vars.relatedTickets = relatedTickets;
  }
}

export function checkTicketsRelevancy(): boolean {
  return true;
}
