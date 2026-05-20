# Deployment

## Vercel (Recommended)

The web platform is optimized for Vercel deployment.

### One-Click Deploy

1. Push your repository to GitHub
2. Import the project in Vercel — it auto-detects the monorepo and Next.js settings
3. Add the required environment variable:
   - `OPENAI_API_KEY` — Your OpenAI API key
4. Deploy

### Root Directory

For the monorepo structure, set the Vercel project's **Root Directory** to `apps/web`.

### Build Settings

When configuring manually, use:

| Setting           | Value                                         |
|-------------------|-----------------------------------------------|
| Framework         | Next.js                                       |
| Build Command     | `pnpm build` (or `pnpm --filter @pr-agent/web build`) |
| Install Command   | `pnpm install`                                |
| Output Directory  | `.next` (auto-detected)                       |

### Environment Variables

| Variable                  | Required | Description                         |
|---------------------------|----------|-------------------------------------|
| `OPENAI_API_KEY`          | Yes      | OpenAI API key for GPT-4            |
| `GITHUB_WEBHOOK_SECRET`   | No       | Secret for verifying webhook payloads |
| `GITHUB_DEPLOYMENT_TYPE`  | No       | Set to `app` to use GitHub App auth |
| `GITHUB_APP_ID`           | No*      | GitHub App ID (required when type=app) |
| `GITHUB_PRIVATE_KEY`      | No*      | GitHub App private key (required when type=app) |
| `GITHUB_INSTALLATION_ID`  | No*      | GitHub App installation ID (required when type=app) |
| `NEXT_PUBLIC_APP_URL`     | No       | Public URL of your deployment       |

*Required only when `GITHUB_DEPLOYMENT_TYPE=app`.

## Other Hosting

The app can be deployed to any Node.js hosting platform (Netlify, Railway, Fly.io, etc.) by building and running the Next.js production server:

```bash
pnpm build
pnpm start
```

## Production Considerations

- Set `NEXT_PUBLIC_APP_URL` to your production domain
- Configure rate limiting for API routes in high-traffic deployments
- Use a dedicated OpenAI API key with usage limits
- Consider adding Redis-based job queuing for concurrent analysis requests
