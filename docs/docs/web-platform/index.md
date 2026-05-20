# PR-Agent Web Platform

The PR-Agent Web Platform is a modern, browser-based interface for AI-powered pull request analysis. Built with Next.js and TypeScript, it provides real-time streaming responses for code review, change summaries, improvement suggestions, and custom Q&A.

## Features

- **Real-time streaming** — Server-Sent Events (SSE) deliver AI responses as they're generated
- **Multiple analysis tools** — Review, Describe, Improve, and Ask, all accessible from a single interface
- **GitHub PR integration** — Fetch and analyze any public GitHub pull request by URL
- **Raw diff support** — Paste any git diff directly for analysis
- **Monorepo architecture** — Modular TypeScript packages for core, tools, agents, and types
- **Vercel-ready** — Deploy to production in minutes

## Technology Stack

| Component       | Technology                         |
|-----------------|------------------------------------|
| Framework       | Next.js 15+                        |
| UI              | React 19, Tailwind CSS             |
| Language        | TypeScript (strict mode)           |
| AI Provider     | OpenAI GPT-4 (streaming)           |
| Package Manager | pnpm                               |
| Token Counting  | js-tiktoken                        |

## Getting Started

See the [Getting Started](./getting_started.md) guide for local setup instructions, or jump to [Deployment](./deployment.md) for production hosting.
