import { PRAgent, commands } from '@pr-agent/tools';

export interface CliArgs {
  version?: boolean;
  pr_url?: string;
  issue_url?: string;
  command?: string;
  rest?: string[];
}

function getVersion(): string {
  return '1.0.0';
}

export function setParser(): { parseArgs(argv?: string[]): CliArgs; printHelp(): void } {
  return {
    parseArgs(argv?: string[]): CliArgs {
      const args: CliArgs = {};
      const input = argv ?? process.argv.slice(2);
      for (let i = 0; i < input.length; i++) {
        const arg = input[i];
        if (arg === '--version') {
          args.version = true;
        } else if (arg.startsWith('--pr_url=')) {
          args.pr_url = arg.split('=', 2)[1];
        } else if (arg.startsWith('--issue_url=')) {
          args.issue_url = arg.split('=', 2)[1];
        } else if (arg.startsWith('--')) {
          continue;
        } else {
          args.command = arg;
          args.rest = input.slice(i + 1);
          break;
        }
      }
      if (!args.command && input.length > 0) {
        const last = input[input.length - 1];
        if (!last.startsWith('--')) {
          args.command = last;
          args.rest = [];
        }
      }
      return args;
    },
    printHelp(): void {
      console.log(`Usage: cli --pr_url=<URL> <command> [<args>].
For example:
- cli --pr_url=... review
- cli --pr_url=... describe
- cli --pr_url=... improve
- cli --pr_url=... ask "write me a poem about this PR"
- cli --pr_url=... reflect
- cli --issue_url=... similar_issue
- cli --pr_url/--issue_url= help_docs [<asked question>]

Supported commands:
- review / review_pr - Add a review that includes a summary of the PR and specific suggestions for improvement.
- ask / ask_question [question] - Ask a question about the PR.
- describe / describe_pr - Modify the PR title and description based on the PR's contents.
- improve / improve_code - Suggest improvements to the code in the PR as pull request comments ready to commit.
  Extended mode ('improve --extended') employs several calls, and provides a more thorough feedback
- reflect - Ask the PR author questions about the PR.
- update_changelog - Update the changelog based on the PR's contents.
- add_docs
- generate_labels
- help_docs - Ask a question, from either an issue or PR context, on a given repo (current context or a different one)

Configuration:
To edit any configuration parameter, just add --config_path=<value>.
For example: 'cli --pr_url=... review --pr_reviewer.extra_instructions="focus on the file: ..."'`);
    },
  };
}

export function runCommand(prUrl: string, command: string): void {
  const runCommandStr = `--pr_url=${prUrl} ${command.replace(/^\//, '')}`;
  const parser = setParser();
  process.argv = ['node', 'cli', ...runCommandStr.split(' ')];
  const args = parser.parseArgs();
  runSync(args);
}

export function runSync(args: CliArgs): void {
  if (args.version) {
    console.log(`pr-agent ${getVersion()}`);
    return;
  }

  if (!args.pr_url && !args.issue_url) {
    setParser().printHelp();
    return;
  }

  const command = (args.command ?? 'review').toLowerCase();

  async function inner(): Promise<boolean> {
    const agent = new PRAgent(
      {} as any,
      () => ({} as any),
      {} as any,
    );

    if (args.issue_url) {
      return await agent.handleRequest(args.issue_url, [command, ...(args.rest ?? [])]);
    }
    return await agent.handleRequest(args.pr_url!, [command, ...(args.rest ?? [])]);
  }

  const result = inner();
  if (!result) {
    setParser().printHelp();
  }
}

export async function run(inargs?: string[]): Promise<void> {
  const parser = setParser();
  const args = parser.parseArgs(inargs);

  if (args.version) {
    console.log(`pr-agent ${getVersion()}`);
    return;
  }

  if (!args.pr_url && !args.issue_url) {
    parser.printHelp();
    return;
  }

  const command = (args.command ?? 'review').toLowerCase();

  const agent = new PRAgent(
    {} as any,
    () => ({} as any),
    {} as any,
  );

  let result: boolean;
  if (args.issue_url) {
    result = await agent.handleRequest(args.issue_url, [command, ...(args.rest ?? [])]);
  } else {
    result = await agent.handleRequest(args.pr_url!, [command, ...(args.rest ?? [])]);
  }

  if (!result) {
    parser.printHelp();
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
