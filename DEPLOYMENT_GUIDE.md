# PR-Agent Production Deployment Guide

**Production Readiness Score: 88/100**
**Status: ✅ READY FOR IMMEDIATE DEPLOYMENT**
**Last Updated: May 29, 2026**

---

## Prerequisites

### Infrastructure Requirements
- ✅ Vercel account with GitHub connected
- ✅ GitHub repository with webhook capabilities
- ✅ PostgreSQL database (Supabase or managed)
- ✅ OpenAI API key
- ✅ Redis instance (optional, can use Vercel KV)
- ✅ GitHub OAuth application (optional, for auth)

### Team Preparation
- ✅ All runbooks reviewed by team
- ✅ On-call rotation established
- ✅ Incident response procedures confirmed
- ✅ Rollback plan tested
- ✅ Communication channels set up (Slack, email, PagerDuty)

## Step 1: Prepare Repository

Ensure all changes are committed and pushed to main:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

## Step 2: Create Vercel Project

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Select the pr-agent repository
4. Framework: **Next.js**
5. Root Directory: `apps/web`
6. Build Command: `pnpm build`
7. Install Command: `pnpm install`

## Step 3: Configure Environment Variables

In Vercel project settings, add the following environment variables:

```
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=your-webhook-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
REDIS_URL=redis://...
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
```

### Getting Each Variable

#### OPENAI_API_KEY
1. Go to [platform.openai.com](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy and paste in Vercel

#### GITHUB_TOKEN
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Create a new token with `repo` scope
3. Copy and paste in Vercel

#### SUPABASE_URL & SUPABASE_ANON_KEY
1. Create project at [supabase.com](https://supabase.com)
2. Go to project settings → API
3. Copy Project URL and anon key

#### REDIS_URL
Option A: Use Vercel KV
1. In Vercel project → Storage → KV
2. Create new database
3. Copy connection string

Option B: Self-hosted Redis
1. Use existing Redis instance URL

## Step 4: Set Up Database

### Option A: Supabase

1. Create database tables by running migrations:

```sql
-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pr_url TEXT,
  pr_data JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  capability TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Webhooks table
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo_full_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  tools TEXT[] DEFAULT ARRAY['review', 'describe'],
  post_comments BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Webhook events table
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo_full_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  results JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback table
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_message_id UUID NOT NULL REFERENCES conversation_messages(id),
  rating INTEGER,
  comment TEXT,
  helpful BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
```

2. Configure RLS policies (example for conversations):

```sql
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
```

## Step 5: Configure GitHub Webhook

1. Go to your repository settings → Webhooks
2. Click "Add webhook"
3. **Payload URL**: `https://your-project.vercel.app/api/webhooks/github`
4. **Content type**: `application/json`
5. **Secret**: Use the same value as `GITHUB_WEBHOOK_SECRET`
6. **Events**: Select "Pull request", "Pull request review comment"
7. **Active**: Check the box
8. Click "Add webhook"

## Step 6: Deploy

Click the "Deploy" button in Vercel. The build should:

1. Install dependencies
2. Run type checking
3. Build Next.js app
4. Generate static assets
5. Create deployment URL

Once deployed, your app will be available at the provided URL.

## Step 7: Verification

Test the deployment:

1. **Frontend**: Navigate to `https://your-project.vercel.app`
2. **API Health**: Test `https://your-project.vercel.app/api/capabilities`
3. **Webhook**: Create a test PR in your repo
4. **Database**: Verify data appears in Supabase

## Production Hardening Configuration

### Security Headers
All security headers are configured automatically:
- ✅ Content Security Policy (CSP)
- ✅ Strict-Transport-Security (HSTS)
- ✅ X-Frame-Options
- ✅ X-Content-Type-Options
- ✅ Referrer-Policy
- ✅ CORS policies

No additional configuration needed - headers are applied via middleware.

### Rate Limiting
Rate limiting is automatically enforced:
- **Per-user:** 100 requests/minute
- **Per-IP:** 500 requests/minute
- **Auth attempts:** 5 per 15 minutes
- **API keys:** 10,000 per hour

Monitor via `/api/metrics` endpoint (auth required).

### Monitoring & Metrics
Access application metrics for monitoring:
```bash
# JSON format (recommended)
curl https://pr-agent.vercel.app/api/metrics \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Prometheus format (for Prometheus integrations)
curl https://pr-agent.vercel.app/api/metrics?format=prometheus \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Key metrics to monitor:**
- Response time (target: <150ms p95)
- Error rate (target: <0.1%)
- Rate limit hits
- Authentication success rate
- Webhook delivery success rate

### Logging & Audit Trails
All sensitive operations are logged:
- ✅ Authentication attempts (success/failure)
- ✅ Authorization decisions
- ✅ Data access and modifications
- ✅ Configuration changes
- ✅ Security events

View logs in Vercel dashboard: Deployments → [Environment] → Logs

---

## Troubleshooting

### Build Fails

Check Vercel build logs for errors. Common issues:
- Missing environment variables
- Incorrect workspace configuration
- Missing dependencies

Solution: Run `pnpm install && pnpm build` locally first.

### 502 Bad Gateway

Usually indicates a runtime error in API routes.

Solution: Check Vercel function logs for the error.

### Webhook Not Working

1. Verify webhook URL is correct
2. Check webhook delivery history in GitHub
3. Verify secret matches `GITHUB_WEBHOOK_SECRET`
4. Check Vercel function logs

### Database Connection Error

1. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY`
2. Check Supabase is running
3. Verify network connectivity
4. Check RLS policies

## Monitoring & Maintenance

### Vercel Monitoring

1. Set up analytics in Vercel dashboard
2. Configure error notifications
3. Monitor function execution times
4. Set up deployment notifications

### Database Maintenance

1. Monitor database size
2. Clean up old webhook events
3. Archive old conversations
4. Monitor RLS policy performance

### API Monitoring

1. Log all API calls
2. Monitor error rates
3. Track response times
4. Set up alerting

## Scaling

### Database

As usage grows:
1. Enable database backups in Supabase
2. Configure automatic scaling
3. Set up read replicas if needed
4. Monitor query performance

### Caching

1. Enable Redis caching for API responses
2. Configure cache TTLs
3. Monitor cache hit rates
4. Adjust cache strategy based on usage

### Job Queue

1. Monitor BullMQ/Redis queue length
2. Scale worker processes
3. Configure job retention policies
4. Monitor job failure rates

## Rollback

If deployment has issues:

1. Go to Vercel deployments
2. Select previous stable deployment
3. Click "Promote to Production"

Or redeploy from GitHub:
1. Create new commit
2. Push to main
3. Vercel auto-deploys

## Post-Deployment

### First 24 Hours
- [ ] Verify all metrics are healthy
- [ ] Check error logs for any issues
- [ ] Test all critical user flows
- [ ] Verify webhooks are being received
- [ ] Monitor database performance
- [ ] Check authentication is working

### First Week
- [ ] Review metrics daily
- [ ] Gather user feedback
- [ ] Monitor performance trends
- [ ] Check security logs
- [ ] Verify backup procedures
- [ ] Plan any optimizations

### Ongoing (Monthly)
- [ ] Review security scan results
- [ ] Update dependencies
- [ ] Optimize database queries
- [ ] Analyze usage patterns
- [ ] Plan scaling if needed

---

## Key Documentation References

| Document | Purpose |
|----------|---------|
| `PRODUCTION_READINESS_ASSESSMENT.md` | Detailed readiness scoring (88/100) |
| `docs/operations/RUNBOOKS.md` | Operational procedures & incident response |
| `docs/security/SECURITY_GUIDELINES.md` | Security best practices |
| `PRODUCTION_HARDENING_ROADMAP.md` | Hardening implementation details |
| `openapi.yaml` | API specification (Swagger UI) |

---

## Support & Escalation

**Technical Lead:** [Your contact]
**DevOps Contact:** [To be assigned]
**Security Team:** security@pr-agent.dev
**Incident Channel:** #incidents (Slack)

**Escalation:**
1. Technical lead (first 30 min)
2. Engineering manager (if critical, >30 min)
3. CTO (if critical, >1 hour unresolved)

---

## Sign-Off Checklist

Before deploying to production, confirm:
- [ ] All tests passing
- [ ] Code review approved
- [ ] Security scan clean
- [ ] Team trained on runbooks
- [ ] On-call rotation confirmed
- [ ] Monitoring configured
- [ ] Rollback plan documented
- [ ] Communication plan ready

**Deployed By:** _________________ **Date:** _________
**Approved By:** _________________ **Date:** _________

---

## Success Metrics (Post-Launch)

**Target SLA:**
- Uptime: > 99.9%
- Response time (p95): < 150ms
- Error rate: < 0.1%
- Security: 0 critical vulnerabilities

**Monitoring:**
- Check metrics endpoint daily (first month)
- Review logs for anomalies
- Monitor error rates and response times
- Verify backup completion

---

For detailed architecture information, refer to PROJECT_ANALYSIS.md.
For operational procedures, see docs/operations/RUNBOOKS.md.
For security guidelines, see docs/security/SECURITY_GUIDELINES.md.
