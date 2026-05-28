# Phase 5: Complete API Route Migration Guide

**Status:** In Progress  
**Phase 4 Completion:** Complete - 1,077 lines of auth UI code added

---

## Overview

Phase 5 refactors all remaining API routes to use the new production-ready patterns established in Phases 1-3:

- Input validation using Zod schemas
- Consistent error handling with typed errors
- Authentication checks on all protected endpoints
- Rate limiting enforcement
- Audit logging for sensitive operations
- Proper HTTP status codes and response formats

---

## Routes Needing Migration

### Status: Already Refactored ✓

1. **POST /api/ask** - PR analysis request
   - Uses AskRequestSchema validation
   - Implements rate limiting
   - Returns SSE stream responses
   - Auth middleware integrated

2. **GET /api/health** - System health check
   - Database connectivity check
   - Dependencies status
   - Uptime tracking
   - Using withMiddleware pattern

3. **Auth Routes** (Phase 4 - New)
   - POST /api/auth/resend-verification
   - GET/PUT /api/auth/profile
   - POST /api/auth/logout

### Status: Review Routes

4. **POST /api/review** - Code review request
   - Needs: ReviewRequestSchema validation
   - Needs: Async job creation with jobQueue
   - Needs: Auth requirement
   - Pattern: Similar to /ask but returns job ID instead of streaming

5. **Improvement Routes**

6. **Description Routes**

7. **Agent Routes**

8. **Capabilities Routes**

9. **Webhook Routes**
   - Config CRUD with webhookHandler
   - GitHub webhook verification
   - Event processing with proper transaction handling

10. **Conversation Routes**
    - List conversations (paginated, per-user)
    - Create conversations
    - Get conversation messages
    - Archive conversations

---

## Implementation Pattern

### Template: Standard Read/Write Route

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/api/middleware';
import { conversationListSchema, conversationCreateSchema } from '@/lib/api/schemas';

// GET - List with pagination
export const GET = withMiddleware(
  z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  async (req) => {
    const { page, limit } = req.body;
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from('conversations')
      .select('*', { count: 'exact' })
      .eq('user_id', req.userId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      items: data,
      total: count || 0,
      page,
      limit,
      hasMore: offset + limit < (count || 0),
    });
  },
  { requireAuth: true }
);

// POST - Create
export const POST = withMiddleware(
  conversationCreateSchema,
  async (req) => {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: req.userId, ...req.body })
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await createAuditLog(req.userId, 'conversation_created', req.requestId);

    return NextResponse.json(data, { status: 201 });
  },
  { requireAuth: true }
);
```

### Template: Streaming Route (like /ask)

```typescript
// Similar to /api/ask - returns SSE stream
// - Use rateLimitMiddleware
// - Validate request body
// - Get user from auth header
// - Create async task if needed
// - Stream responses back
```

### Template: Job-Based Route (like /review)

```typescript
// Returns job ID immediately
// - Create job in database
// - Return 202 Accepted with job ID
// - Client polls /api/jobs/:id for status
// - Background worker processes the job
```

---

## Critical Patterns to Follow

### 1. Error Handling
```typescript
// Always return typed errors
try {
  // operation
} catch (error) {
  if (error instanceof PostgrestError) {
    return formatErrorResponse(
      ERROR_CODES.DATABASE_ERROR,
      'Failed to fetch data',
      500,
      error.details,
      req.requestId
    );
  }
  // ...
}
```

### 2. Rate Limiting
```typescript
// Apply to all endpoints
const rateLimitResponse = rateLimitMiddleware(request, {
  endpoint: '/api/ask',
  userId: req.userId,
});
if (rateLimitResponse) return rateLimitResponse;
```

### 3. Authorization
```typescript
// Check ownership of resources
const conversation = await getConversation(id);
if (conversation.user_id !== req.userId) {
  return formatErrorResponse(ERROR_CODES.FORBIDDEN, 'Access denied', 403);
}
```

### 4. Audit Logging
```typescript
// Log sensitive operations
await createAuditLog(
  req.userId,
  'webhook_config_updated',
  req.requestId,
  { configId: config.id, changes: { ...updates } }
);
```

---

## Route Priority (Suggested Order)

### Week 1 (Critical)
1. `/review` - Most used endpoint
2. `/improve` - Frequently used
3. `/describe` - Frequently used
4. `/conversations` - Data persistence critical

### Week 2 (Standard)
5. `/agents` - List user agents
6. `/capabilities` - List available capabilities
7. `/jobs` - Job status polling
8. `/webhook/config` - Webhook management

### Week 3 (Integration)
9. `/webhook/github` - GitHub event processing
10. Polish & testing

---

## Testing Checklist for Each Route

For each refactored route:

- [ ] Invalid request body is rejected
- [ ] Missing auth token returns 401
- [ ] Rate limit is enforced
- [ ] User can only access their own resources
- [ ] Audit log is created
- [ ] Response format matches spec
- [ ] Error messages are helpful
- [ ] Database connections are properly handled

---

## Deployment Order

1. Refactor auth-protected routes first (easier to test)
2. Refactor database routes (with migration)
3. Refactor webhook routes (manual testing required)
4. Refactor job routes (ensure queue is working)

---

## Rollback Plan

Each refactored route must be:
- Tested in staging
- Feature-flagged in production
- Monitored for errors
- Easily revertible within 24 hours

---

## Next Steps

1. Refactor `/api/review` route
2. Refactor conversation routes
3. Refactor webhook routes
4. Create integration tests
5. Deploy to staging
6. Performance testing & optimization
