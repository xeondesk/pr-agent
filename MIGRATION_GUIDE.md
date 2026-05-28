# Production Implementation Guide

This guide walks through implementing the production-ready changes to convert PR-Agent from prototype to production.

## Overview

The migration consists of 8 phases. Total estimated effort: **4-6 weeks** for a team of 3-4 engineers.

## Phase 1: Environment & Configuration Setup (2-3 days)

### 1.1 Generate Security Keys

```bash
# Generate encryption key (for AES-256-GCM encryption)
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"

# Generate API signature secret
API_SIGNATURE_SECRET=$(openssl rand -hex 16)
echo "API_SIGNATURE_SECRET=$API_SIGNATURE_SECRET"
```

### 1.2 Configure Environment Variables

1. Copy `.env.example` to `.env.local`
2. Fill in all required variables:
   - **Supabase**: Get from project settings
   - **OpenAI**: Get API key from platform.openai.com
   - **GitHub**: Get token for API access
   - **Security Keys**: Use generated values above

### 1.3 Verify Configuration

```bash
# Check that all required variables are set
npm run validate:config

# This will fail if any required variables are missing
# See output for which variables need to be added
```

## Phase 2: Database Schema Deployment (2-3 days)

### 2.1 Review the Schema

The complete schema is defined in: `/lib/db.migrations.sql`

Key tables:
- `user_profiles` - Extended user info (name, avatar, subscription tier)
- `conversations` - PR analysis sessions
- `conversation_messages` - User queries and AI responses
- `webhook_configs` - GitHub webhook integrations per user
- `webhook_events` - Events triggered by webhooks
- `audit_logs` - Security audit trail
- `api_usage` - Rate limiting and usage tracking
- `user_api_keys` - API keys for programmatic access

### 2.2 Deploy Schema to Supabase

**Option A: Using Supabase SQL Editor (Recommended for first time)**

1. Go to your Supabase dashboard
2. Click "SQL Editor" in the sidebar
3. Click "New Query"
4. Copy contents of `/lib/db.migrations.sql`
5. Paste into the query editor
6. Click "Run"

**Option B: Using Supabase CLI**

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-id

# Create migration from our SQL
supabase migration up
```

### 2.3 Verify Schema

Check that all tables are created:

```sql
-- Run in Supabase SQL Editor
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

Expected tables: user_profiles, conversations, conversation_messages, webhook_configs, webhook_events, feedback, audit_logs, api_usage, user_api_keys

### 2.4 Enable Row Level Security (RLS)

The migration script automatically enables RLS. Verify it's enabled:

```sql
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

All should show `rowsecurity = true`

## Phase 3: Authentication & Session Management (3-4 days)

### 3.1 Verify Auth is Enabled in Supabase

1. Go to Settings → Authentication → Policies
2. Ensure JWT is enabled (default)
3. Note the JWT secret (you'll need it for testing)

### 3.2 Create Auth UI Components

Create: `app/auth/login/page.tsx`
- Email/password login form
- Form validation
- Error handling
- Success redirect

Create: `app/auth/register/page.tsx`
- Registration form
- Password strength validation
- Terms acceptance
- Auto-login after registration

### 3.3 Update Main Layout

```tsx
// app/layout.tsx
import { AuthProvider } from '@/components/AuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout({ children }: Props) {
  return (
    <html>
      <body>
        <AuthProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
```

### 3.4 Create useAuth Hook

```tsx
// hooks/useAuth.ts
'use client';
import { useContext } from 'react';
import { AuthContext } from '@/components/AuthProvider';

export function useAuth() {
  const { user, session, signOut, loading } = useContext(AuthContext);
  return { user, session, signOut, loading };
}
```

## Phase 4: API Route Hardening (3-4 days)

### 4.1 Refactor Each API Route

For each route in `/app/api/`:

1. **Add request validation**:
   ```ts
   import { AskRequestSchema } from '@/lib/validation';
   const validated = AskRequestSchema.parse(await request.json());
   ```

2. **Add auth middleware**:
   ```ts
   import { createApiHandler } from '@/lib/errors';
   export const POST = createApiHandler(async (req, userId) => {
     // handler code with userId
   }, { requireAuth: true });
   ```

3. **Add error handling**:
   ```ts
   try {
     // operation
   } catch (error) {
     if (error instanceof ApiError) {
       return formatErrorResponse(...);
     }
     // handle other errors
   }
   ```

4. **Add rate limiting**:
   ```ts
   return addRateLimitHeaders(response, request, '/api/endpoint');
   ```

### 4.2 Create Webhook Handler Example

See: `/app/api/conversations/route.ts` for the pattern

### 4.3 Test Each Route

For each route, test:
- ✅ Valid request → Success response
- ✅ Missing auth → 401 Unauthorized
- ✅ Invalid input → 400 Validation error
- ✅ Rate limit exceeded → 429 Too Many Requests
- ✅ Server error → 500 Internal error

## Phase 5: Webhook Secret Management (2-3 days)

### 5.1 Generate Webhook Secret

```ts
import { generateSecret } from '@/lib/security';

const webhookSecret = generateSecret(32); // 32 bytes
// Store this in user's webhook config
```

### 5.2 Hash and Store Secret

```ts
import { hashSecret, encryptValue } from '@/lib/security';

const secretHash = hashSecret(webhookSecret);
// Store secretHash in database
// Return only the secret to user (never store plain text)
```

### 5.3 Verify GitHub Webhooks

```ts
import { verifyGitHubWebhookSignature } from '@/lib/security';

const signature = request.headers.get('x-hub-signature-256');
const payload = await request.text();
const secret = // fetch from database

const isValid = verifyGitHubWebhookSignature(payload, signature, secret);
if (!isValid) {
  return new Response('Unauthorized', { status: 401 });
}
```

### 5.4 Encrypt GitHub Token Storage

```ts
import { encryptValue, decryptValue } from '@/lib/security';

// When storing GitHub token
const encrypted = encryptValue(githubToken);
await db.update('webhook_configs', { github_token_hash: encrypted });

// When using GitHub token
const encrypted = await db.get('webhook_configs', configId);
const token = decryptValue(encrypted.github_token_hash);
```

## Phase 6: Database Operations Integration (3-4 days)

### 6.1 Replace In-Memory Storage

Remove all `new Map()` instances from:
- `/app/api/webhooks/config/route.ts`
- `/app/api/webhooks/github/route.ts`
- Any other files using in-memory storage

### 6.2 Use DB Operations

```ts
import * as dbOps from '@/lib/db.operations';

// Instead of: webhookConfigs.get(id)
const config = await dbOps.getWebhookConfig(userId, configId);

// Instead of: webhookConfigs.set(id, config)
await dbOps.updateWebhookConfig(userId, configId, config);

// Instead of: webhookConfigs.delete(id)
await dbOps.deleteWebhookConfig(userId, configId);
```

### 6.3 Persist Conversation History

```ts
import * as dbOps from '@/lib/db.operations';

// Create conversation
const conversation = await dbOps.createConversation(userId, {
  title: 'PR Review',
  pr_url: prUrl,
});

// Add messages
await dbOps.createMessage(conversation.id, {
  role: 'user',
  content: 'userQuery',
});

await dbOps.createMessage(conversation.id, {
  role: 'assistant',
  content: 'aiResponse',
});
```

## Phase 7: Rate Limiting & Monitoring (2-3 days)

### 7.1 Enable Rate Limiting

Set in `.env.local`:
```
ENABLE_RATE_LIMITING=true
RATE_LIMIT_REQUESTS_PER_MINUTE=60
```

### 7.2 Monitor API Usage

Track in database:
```ts
import * as dbOps from '@/lib/db.operations';

// Log API call
const endTime = Date.now();
const responseTime = endTime - startTime;

await dbOps.createAuditLog(userId, {
  action: 'api_call',
  resource_type: 'api',
  changes: {
    endpoint: '/api/ask',
    responseTime,
    tokensUsed: result.tokens,
  },
});
```

### 7.3 Set Up Error Tracking (Optional)

If using Sentry:

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

## Phase 8: Testing & Deployment (4-5 days)

### 8.1 Create Test Suite

```bash
npm install -D vitest @testing-library/react

# Create tests for:
# - API routes with auth
# - Validation schemas
# - Security functions
# - Database operations
```

### 8.2 Test Production Config

```bash
# Run config validation
npm run validate:config

# Test database connection
npm run test:db

# Test auth flow
npm run test:auth
```

### 8.3 Deploy to Production

1. **Prepare**:
   - Set all production environment variables
   - Run database migrations
   - Verify all features enabled

2. **Test**:
   - Run smoke tests
   - Test auth flow end-to-end
   - Test webhook delivery
   - Test rate limiting

3. **Deploy**:
   ```bash
   git push origin main
   # Vercel auto-deploys, or:
   npm run build && npm start
   ```

4. **Monitor**:
   - Check error logs
   - Monitor API response times
   - Track webhook success rate
   - Monitor rate limiting buckets

## Rollback Plan

If issues occur:

1. **Revert code**: `git revert <commit>`
2. **Keep database**: Migrations are backward-compatible
3. **Disable features**: Set feature flags in env vars
4. **Check logs**: Sentry/error logs for debugging

## Checklist

### Pre-Production
- [ ] All environment variables set and validated
- [ ] Database schema deployed and RLS enabled
- [ ] Auth system tested end-to-end
- [ ] All API routes refactored with validation
- [ ] Error handling tested
- [ ] Rate limiting enabled and tested
- [ ] Webhook verification implemented
- [ ] Security keys generated and stored

### Post-Deployment
- [ ] Monitor error rates for 24 hours
- [ ] Check webhook delivery success rate
- [ ] Verify authentication flow working
- [ ] Confirm database persisting data
- [ ] Test rate limiting is enforced
- [ ] Review audit logs for security issues
- [ ] Load test with expected traffic

## Support

If issues arise:
1. Check console logs and Sentry
2. Review audit logs for context
3. Check rate limiting status
4. Verify database connectivity
5. Test with minimal case to isolate issue

For questions, refer to `/PRODUCTION_AUDIT_REPORT.md` for detailed analysis of each component.
