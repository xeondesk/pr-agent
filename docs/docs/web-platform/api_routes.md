# API Routes

All API routes use Server-Sent Events (SSE) for real-time streaming responses. They accept `POST` requests with a JSON body.

## POST /api/review

Comprehensive PR analysis with code quality feedback.

### Request

```json
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "diff": "optional: raw diff content",
  "userQuery": "optional: additional context or focus area"
}
```

Provide either `prUrl` (for GitHub PRs) or `diff` (for raw diffs). Both can be combined.

### Response

Server-Sent Events stream. Each event is a `data:` line with a text chunk. The stream ends with `data: [DONE]`.

```
data: Initializing review...
data: ## Code Quality Analysis
data: ...
data: [DONE]
```

## POST /api/describe

Generate a summary of PR changes.

### Request

Same format as `/api/review`.

### Response

SSE stream with a structured change summary.

## POST /api/improve

Get actionable improvement suggestions.

### Request

```json
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "diff": "optional: raw diff content",
  "userQuery": "optional: focus area (e.g. 'security', 'performance')"
}
```

### Response

SSE stream with prioritized code suggestions.

## POST /api/ask

Ask custom questions about the PR.

### Request

```json
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "diff": "optional: raw diff content",
  "userQuery": "What potential edge cases are missing?"
}
```

`userQuery` is required for this endpoint.

### Response

SSE stream with the AI-generated answer.

## POST /api/agents

List and manage available analysis agents.

## POST /api/capabilities

Query the available tool capabilities.

## POST /api/jobs

Manage analysis job state and history.

## POST /api/webhooks/github

Webhook endpoint for GitHub events. Receives push, pull request, and issue comment events to trigger automated analysis.

## POST /api/webhooks/config

Configure webhook settings for automated PR analysis.

## Common Request Format

All analysis endpoints accept:

| Field      | Type   | Required | Description                            |
|------------|--------|----------|----------------------------------------|
| `prUrl`    | string | No*      | GitHub PR URL to analyze               |
| `diff`     | string | No*      | Raw git diff content                   |
| `userQuery`| string | No       | Additional context or specific question|

*At least one of `prUrl` or `diff` must be provided.

## Error Handling

Errors are returned as SSE messages:

```json
data: Error: OpenAI API key is not set
```

Or as standard HTTP error responses for request validation:

```
HTTP 400: PR URL or diff required
HTTP 500: Internal server error
```
