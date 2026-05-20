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

GitHub webhook receiver. Processes `opened` and `synchronize` pull request events to trigger automated analysis.

### Signature Verification

The endpoint verifies every request using `x-hub-signature-256`. Set the `GITHUB_WEBHOOK_SECRET` environment variable to match the secret configured in your GitHub App settings.

### Events Handled

| Event                     | Action      | Behavior                          |
|---------------------------|-------------|-----------------------------------|
| `pull_request`            | `opened`    | Runs configured tools on new PR   |
| `pull_request`            | `synchronize` | Runs tools on new push to PR    |
| Other                     | —           | Returns 200 with "Unhandled action" |

### Response

Returns `202 Accepted` with an `eventId` for status tracking.

## POST /api/webhooks/config

Configure webhook settings per repository. Controls which tools run automatically and whether results are posted as comments.

### Request

```json
{
  "repo": "owner/repo-name",
  "enabled": true,
  "autoReview": true,
  "autoDescribe": true,
  "autoImprove": false,
  "postComments": true
}
```

### Response

Returns the saved configuration with a generated webhook secret and URL for configuring the GitHub webhook.

## GET /api/webhooks/github?eventId=<id>

Check the status and results of a processed webhook event. Returns the event object with its current status (`pending`, `processing`, `completed`, `failed`).

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
