# Production Implementation Checklist

Track progress on converting PR-Agent to production-ready code.

## Foundation (Week 1)

### Day 1-2: Setup & Configuration
- [ ] Generate security keys (ENCRYPTION_KEY, API_SIGNATURE_SECRET)
- [ ] Copy `.env.example` to `.env.local`
- [ ] Fill in all required environment variables
- [ ] Run `npm run validate:config` and verify all pass
- [ ] Commit .env.local to secure storage (1Password, AWS Secrets Manager, etc.)

### Day 2-3: Database Deployment
- [ ] Review `/lib/db.migrations.sql`
- [ ] Connect to Supabase SQL Editor
- [ ] Execute migration SQL
- [ ] Verify all 9 tables created
- [ ] Verify RLS enabled on all tables
- [ ] Test RLS policies with sample queries

### Day 3-4: Auth Verification
- [ ] Enable Supabase Auth (should be default)
- [ ] Create test user through Supabase dashboard
- [ ] Test login flow in browser
- [ ] Verify JWT tokens being issued
- [ ] Test session refresh

### Day 4-5: Initial API Testing
- [ ] Pick 3 key endpoints: `/api/ask`, `/api/webhooks/config`, `/api/webhooks/github`
- [ ] Test each endpoint with curl and valid auth header
- [ ] Test with invalid auth (should return 401)
- [ ] Test with invalid input (should return 400)
- [ ] Verify error responses use new format

## API Hardening (Week 1-2)

### Day 5-6: Validation Schemas
- [x] Review `validation.ts` schemas
- [x] Add validation to `/api/ask/route.ts`
- [x] Add validation to `/api/review/route.ts`
- [x] Add validation to `/api/describe/route.ts`
- [x] Add validation to `/api/improve/route.ts`
- [x] Add validation to `/api/agents/route.ts`
- [x] Add validation to `/api/capabilities/route.ts`
- [x] Test each endpoint with invalid data

### Day 7-8: Error Handling
- [x] Use `formatErrorResponse` / `parseRequestBody` in all API routes
- [x] All routes return 401 for missing/invalid auth
- [x] All routes return 400 for invalid input (via Zod validation)
- [x] All routes return 500 for internal errors (caught by try/catch)
- [x] Verify error codes are consistent (UNAUTHORIZED, VALIDATION_ERROR, INTERNAL_ERROR, etc.)

### Day 9-10: Webhook Hardening
- [x] Review webhook secret management in `security.ts`
- [x] Implement webhook signature verification in `/api/webhooks/github/route.ts`
- [x] Fix `verifyGitHubSignature` timing-safe comparison (pre-existing crash bug)
- [x] Test valid webhook signature (should succeed)
- [x] Test invalid webhook signature (should return 401)
- [x] Test missing signature (should return 401)
- [x] Generate and store test webhook secret

### Day 11-12: Rate Limiting
- [x] Implement `rateLimitMiddleware` in all API routes
- [x] Implement `webhookRateLimit` in webhook routes
- [x] Add `addRateLimitHeaders` to all responses
- [x] Handle config failure gracefully (returns null instead of crashing)
- [ ] Enable rate limiting in `.env.local`: `ENABLE_RATE_LIMITING=true`
- [ ] Test rate limiting on `/api/ask` endpoint
- [ ] Make 61 requests in 1 minute, verify 61st returns 429
- [ ] Verify rate limit headers in response
- [ ] Test per-user rate limiting vs IP-based

## Data Persistence (Week 2)

### Day 13-14: Conversation Persistence
- [ ] Import `db.operations.ts` functions
- [ ] Update ChatInterface component to use `createConversation()`
- [ ] Update ChatInterface to use `createMessage()`
- [ ] Update ChatInterface to use `getConversationMessages()`
- [ ] Test conversation is saved to database
- [ ] Test message history persists on page reload

### Day 15-16: Webhook Config Persistence
- [ ] Replace `new Map()` in `/api/webhooks/config/route.ts`
- [ ] Use `dbOps.createWebhookConfig()` instead
- [ ] Use `dbOps.listWebhookConfigs()` instead
- [ ] Use `dbOps.updateWebhookConfig()` instead
- [ ] Use `dbOps.deleteWebhookConfig()` instead
- [ ] Test webhook configs persist in Supabase

### Day 17-18: Webhook Event Persistence
- [ ] Replace `new Map()` in `/api/webhooks/github/route.ts`
- [ ] Use `dbOps.createWebhookEvent()` to store events
- [ ] Use `dbOps.updateWebhookEvent()` to update status
- [ ] Test webhook events show in Supabase
- [ ] Test event status transitions: pending → processing → completed

### Day 19-20: User Profile Setup
- [ ] Create migration to populate `user_profiles` from `auth.users`
- [ ] Implement profile creation on user signup
- [ ] Add profile update endpoint `/api/profile`
- [ ] Test profile data persists
- [ ] Test profile data is RLS protected

## Security & Monitoring (Week 2-3)

### Day 21-22: Secret Encryption
- [ ] Review `security.ts` encryption functions
- [ ] Implement GitHub token encryption in webhook config
- [ ] Encrypt webhook secrets in database
- [ ] Decrypt on use
- [ ] Verify no plain text secrets in database

### Day 23-24: Audit Logging
- [ ] Add `createAuditLog()` calls to all mutation endpoints
- [ ] Log: create conversation, update conversation, delete conversation
- [ ] Log: create webhook config, update webhook config, delete webhook config
- [ ] Log: process webhook event
- [ ] Test audit logs appear in database

### Day 25-26: API Usage Tracking
- [ ] Create API usage tracking in response middleware
- [ ] Track endpoint, method, response time, tokens used
- [ ] Store in `api_usage` table
- [ ] Create dashboard query to show usage by user/endpoint
- [ ] Monitor for unusual patterns

### Day 27-28: Error Tracking (Sentry Optional)
- [ ] If using Sentry: Set `SENTRY_DSN` in env
- [ ] Initialize Sentry in middleware
- [ ] Test error logging to Sentry
- [ ] Create Sentry project alerts for critical errors
- [ ] Document how to check error logs

## Testing & QA (Week 3-4)

### Day 29-30: Smoke Tests
- [ ] Create manual test plan
- [ ] Test user registration flow
- [ ] Test user login flow
- [ ] Test creating conversation
- [ ] Test sending query to `/api/ask`
- [ ] Test webhook configuration
- [ ] Test webhook delivery

### Day 31-32: Integration Tests
- [ ] Test end-to-end conversation flow
- [ ] Test webhook delivery and processing
- [ ] Test rate limiting across multiple users
- [ ] Test concurrent requests
- [ ] Test error recovery

### Day 33-34: Load Testing
- [ ] Estimate production traffic
- [ ] Run load test with expected traffic levels
- [ ] Monitor database performance
- [ ] Check rate limiting at scale
- [ ] Monitor response times under load

### Day 35-36: Security Audit
- [ ] Review all API endpoints for auth
- [ ] Check RLS policies on database
- [ ] Verify no secrets in logs
- [ ] Verify no SQL injection vulnerabilities
- [ ] Verify CORS properly configured

## Deployment (Week 4)

### Day 37-38: Staging Deployment
- [ ] Set production environment variables
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Test with real data volumes
- [ ] Monitor staging logs

### Day 39-40: Production Deployment
- [ ] Final production environment setup
- [ ] Run all migrations one more time
- [ ] Deploy to production
- [ ] Monitor error logs for 1 hour
- [ ] Test critical user flows in production

### Day 41-42: Post-Deployment
- [ ] Monitor error rate for 24 hours
- [ ] Monitor API response times
- [ ] Check rate limiting is working
- [ ] Verify webhook delivery success rate
- [ ] Review audit logs
- [ ] Collect initial user feedback

## Ongoing

### Weekly
- [ ] Review error logs in Sentry
- [ ] Check database performance metrics
- [ ] Review rate limiting patterns
- [ ] Monitor API quota usage by user
- [ ] Check for security audit log anomalies

### Monthly
- [ ] Review and update rate limits based on usage
- [ ] Audit access logs for suspicious patterns
- [ ] Test disaster recovery procedures
- [ ] Update documentation
- [ ] Plan next round of improvements

## Critical Path Items (Blockers)

These must be completed before production:
1. [ ] Database schema deployed and RLS enabled
2. [ ] Authentication system tested end-to-end
3. [x] All API routes have validation and error handling
4. [x] Webhook signature verification implemented
5. [ ] Environment variables set and validated
6. [ ] Security keys generated
7. [ ] In-memory storage replaced with database
8. [ ] Rate limiting implemented (needs env var enabled)
9. [ ] Audit logging implemented
10. [ ] Smoke tests pass on staging

## Sign-Off

- [ ] Tech Lead: Implementation complete and reviewed
- [ ] QA: All tests pass
- [ ] Product: Feature parity with prototype
- [ ] Security: Security audit complete
- [ ] DevOps: Deployment plan reviewed

**Completion Date**: ____________

**Notes**:
```
[Add notes about implementation progress, blockers, lessons learned]
```
