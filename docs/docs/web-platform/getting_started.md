# Getting Started

## Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn
- An [OpenAI API key](https://platform.openai.com/api-keys) with GPT-4 access

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cd apps/web
cp .env.example .env.local
```

Edit `.env.local` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. Start development server

```bash
pnpm dev
```

### 4. Open in browser

Visit **http://localhost:3000**

## Usage

### Analyze a GitHub PR

1. Copy a GitHub PR URL: `https://github.com/owner/repo/pull/123`
2. Paste it into the input field on the home page
3. Select an analysis type (Review, Describe, Improve, or Ask)
4. Click "Analyze" and watch the streaming response

### Analyze a Raw Diff

1. Copy any git diff output
2. Paste it directly into the input field
3. Select an analysis type
4. Click "Analyze"

## Available Commands

```bash
pnpm dev          # Start development server (from root or apps/web)
pnpm build        # Build for production
pnpm start        # Run production build
pnpm type-check   # Run TypeScript type checking
pnpm lint         # Run ESLint
```
