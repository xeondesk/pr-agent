# PR-Agent Web Platform

An AI-powered pull request analysis platform built with Next.js and TypeScript.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- OpenAI API key

### Installation

1. Clone and navigate to the project:
```bash
cd apps/web
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local and add your OpenAI API key
```

4. Start the development server:
```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Features

### Analysis Tools

- **Review**: Comprehensive PR analysis with code quality feedback
- **Describe**: Generate clear summaries of changes
- **Improve**: Actionable improvement suggestions
- **Ask**: Ask custom questions about the PR

### Input Methods

- Paste a GitHub PR URL (with GitHub API access)
- Paste raw diff content directly

### Streaming Response

Real-time streaming responses using Server-Sent Events (SSE) for instant feedback.

## Project Structure

```
apps/web/
├── app/
│   ├── api/              # API routes with streaming SSE support
│   │   ├── review/
│   │   ├── describe/
│   │   ├── improve/
│   │   └── ask/
│   ├── components/       # React components
│   ├── page.tsx          # Home page
│   └── layout.tsx        # Root layout
├── lib/
│   └── prAgent.ts        # Core PR-Agent library (consolidated)
└── public/               # Static assets
```

## API Routes

### POST /api/review
Analyze a pull request with comprehensive review feedback.

Request body:
```json
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "diff": "optional: raw diff content",
  "userQuery": "optional: additional context"
}
```

Response: Server-Sent Event stream of review content

### POST /api/describe
Generate a summary of PR changes.

Same request format as /api/review.

### POST /api/improve
Get improvement suggestions for the code.

Same request format as /api/review.

### POST /api/ask
Ask specific questions about the PR.

Request body must include `userQuery`.

## Technology Stack

- **Frontend**: Next.js 15+, React 19+, Tailwind CSS
- **Backend**: Next.js API routes, Node.js runtime
- **AI**: OpenAI GPT-4 with streaming
- **Language**: TypeScript (strict mode)
- **Token Counting**: js-tiktoken for accurate token usage

## Core Components

### Utilities

- **TokenCounter**: Accurate token counting for prompts and responses
- **PatchParser**: Parse and analyze git diffs
- **Compression**: Compress large diffs for token optimization

### Tools

- **ReviewTool**: Full PR analysis
- **DescribeTool**: Change summaries
- **ImproveTool**: Code improvement suggestions
- **AskTool**: Custom question answering

### Agent

- **ReviewAgent**: Orchestrates tool execution and streaming responses

## Environment Variables

```
OPENAI_API_KEY     - Your OpenAI API key (required)
```

## Development

### Build
```bash
pnpm build
```

### Type Check
```bash
pnpm type-check
```

### Run Production Build
```bash
pnpm start
```

## Deployment

The app is production-ready and can be deployed to Vercel, Netlify, or any Node.js hosting platform.

### Vercel Deployment

1. Push to GitHub
2. Import project in Vercel
3. Add `OPENAI_API_KEY` environment variable
4. Deploy

## Features Coming Soon

- GitHub OAuth for PR fetching
- PR webhook integration
- Conversation history storage
- Custom analysis templates
- Batch PR analysis
- Rate limiting and usage tracking
- Team collaboration features

## License

MIT

## Support

For issues and feature requests, open an issue in the repository.
