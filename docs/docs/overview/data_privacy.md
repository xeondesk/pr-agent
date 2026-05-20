## Self-hosted PR-Agent

When you self-host PR-Agent, your data stays under your control:

- **Code and PR data** — All source code, pull request diffs, and repository metadata are processed on your infrastructure. No code is sent to external services beyond the LLM provider you configure.

- **LLM provider communication** — The only data shared externally is the PR context sent to the LLM provider (OpenAI, Anthropic, Google, etc.) via their API. This is governed by your agreement with that provider.

- **No data storage** — PR-Agent does not persistently store your code or PR data. Each analysis is ephemeral and runs only when triggered.

- **Self-hosting options** — PR-Agent can be deployed via Docker, as a GitHub Action, a serverless function, or directly from source. In all cases, you control where and how it runs.

- **Configuration** — All settings and secrets are managed through your own environment variables, `.secrets.toml`, or `.pr_agent.toml` files. No telemetry or usage data is sent back to the project maintainers.

If you have specific compliance or data governance requirements, self-hosting ensures full control over your data pipeline.
