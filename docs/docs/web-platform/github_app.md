# GitHub App Setup

The web platform supports running as a GitHub App, enabling automated PR analysis via webhooks. When installed on a repository, it can automatically review, describe, and improve pull requests as they're opened or updated.

## Prerequisites

- A deployed instance of the web platform (see [Deployment](./deployment.md))
- The ability to receive webhooks at your deployment's `/api/webhooks/github` endpoint

## Option A: One-Click with Manifest (Recommended)

The repository includes a pre-configured GitHub App manifest:

1. Open the manifest URL (replace `APP_URL` with your deployed app URL):
   ```
   https://github.com/settings/apps/new?manifest_url=APP_URL/github-app-manifest.json
   ```

2. GitHub renders a confirmation page with the app's permissions (pull_requests: write, issues: write, contents: read, metadata: read) and events (pull_request, issue_comment, push). Click **Create GitHub App**.

3. After creation, GitHub redirects to a page with your new App's credentials. Note the following:
   - **App ID**
   - **App private key** (download the `.pem` file)
   - **Webhook secret** (shown once)

4. Run the setup script to write credentials to your environment:
   ```bash
   bash scripts/setup-github-app.sh <app_id> /path/to/private-key.pem <webhook_secret> <installation_id>
   ```

5. In the GitHub App settings, go to **Install App** and install it on your repositories.

## Option B: Manual Setup

1. Go to **GitHub Settings > Developer settings > GitHub Apps > New GitHub App**.

2. Configure the app:
   | Setting | Value |
   |---------|-------|
   | GitHub App name | `pr-agent-web` (or your choice) |
   | Homepage URL | Your deployment URL |
   | Webhook URL | `https://your-domain.com/api/webhooks/github` |
   | Webhook secret | Generate one: `openssl rand -hex 20` |

3. Set permissions:
   - Pull requests: **Read & write**
   - Issues: **Read & write**
   - Contents: **Read-only**
   - Metadata: **Read-only**

4. Subscribe to events:
   - Pull request
   - Issue comment
   - Push (optional — triggers analysis on PR update)

5. Create the app and download the private key. Note the **App ID**.

6. Install the app on your repositories from the **Install App** tab. Note the **Installation ID** (found in the URL when viewing installation settings).

7. Set environment variables:
   ```bash
   GITHUB_DEPLOYMENT_TYPE=app
   GITHUB_APP_ID=<your-app-id>
   GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   GITHUB_INSTALLATION_ID=<your-installation-id>
   GITHUB_WEBHOOK_SECRET=<your-webhook-secret>
   ```

## How It Works

Once installed and configured:

1. A user opens or updates a PR on a repository where the app is installed
2. GitHub sends a webhook event to `/api/webhooks/github`
3. The webhook handler verifies the signature using the webhook secret
4. Based on the repo's configuration, it runs review, describe, and/or improve tools
5. Results are posted as comments on the PR (if `post_comments` is enabled)

## Webhook Configuration

Configure per-repository behavior through the web UI at `/webhooks/config` or via the API:

| Setting | Default | Description |
|---------|---------|-------------|
| `auto_review` | `true` | Run review tool on new PRs |
| `auto_describe` | `true` | Run describe tool on new PRs |
| `auto_improve` | `false` | Run improve tool on new PRs |
| `post_comments` | `true` | Post results as PR comments |

## Authentication

The GitHub App uses JWT-based authentication. The private key is used to generate short-lived installation tokens, which are then used to fetch PR data and post comments. No personal access token (PAT) is needed — the app authenticates as itself.
