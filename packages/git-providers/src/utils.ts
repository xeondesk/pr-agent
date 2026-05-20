import { GitProvider } from './gitProvider.js';
import { GithubProvider } from './githubProvider.js';
import { GitLabProvider } from './gitlabProvider.js';
import { BitbucketProvider } from './bitbucketProvider.js';
import { BitbucketServerProvider } from './bitbucketServerProvider.js';
import { AzureDevopsProvider } from './azuredevopsProvider.js';
import { CodeCommitProvider } from './codecommitProvider.js';
import { LocalGitProvider } from './localGitProvider.js';
import { GerritProvider } from './gerritProvider.js';
import { GiteaProvider } from './giteaProvider.js';

type GitProviderCtor = new (...args: any[]) => GitProvider;

export const gitProviders: Record<string, GitProviderCtor> = {
  github: GithubProvider as unknown as GitProviderCtor,
  gitlab: GitLabProvider as unknown as GitProviderCtor,
  bitbucket: BitbucketProvider as unknown as GitProviderCtor,
  bitbucket_server: BitbucketServerProvider as unknown as GitProviderCtor,
  azure: AzureDevopsProvider as unknown as GitProviderCtor,
  codecommit: CodeCommitProvider as unknown as GitProviderCtor,
  local: LocalGitProvider as unknown as GitProviderCtor,
  gerrit: GerritProvider as unknown as GitProviderCtor,
  gitea: GiteaProvider as unknown as GitProviderCtor,
};

const _gitProviderCache: Map<string, GitProvider> = new Map();

export function getGitProvider(providerId?: string): GitProviderCtor {
  const id = providerId || process.env['GIT_PROVIDER'] || 'github';
  const Provider = gitProviders[id];
  if (!Provider) {
    throw new Error(`Unknown git provider: ${id}`);
  }
  return Provider;
}

export function getGitProviderWithContext(prUrl: string): GitProvider {
  const cached = _gitProviderCache.get(prUrl);
  if (cached) {
    return cached;
  }

  const providerId = process.env['GIT_PROVIDER'] || 'github';
  const Provider = gitProviders[providerId];
  if (!Provider) {
    throw new Error(`Unknown git provider: ${providerId}`);
  }

  const provider = new Provider(prUrl);
  _gitProviderCache.set(prUrl, provider);
  return provider;
}

export async function applyRepoSettings(prUrl: string): Promise<void> {
  const gitProvider = getGitProviderWithContext(prUrl);
  try {
    const repoContent = await gitProvider.getRepoSettings();
    if (repoContent) {
      console.info('Applying repo settings for', prUrl);
    }
  } catch (e) {
    console.error('Failed to apply repo settings', { error: String(e) });
  }
}
