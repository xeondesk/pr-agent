/**
 * Conversations API - Production-ready example
 * 
 * This demonstrates the new patterns:
 * - Request validation with Zod
 * - Error handling with proper status codes
 * - Authentication middleware
 * - Database operations
 * - Rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, formatSuccessResponse, createErrors } from '@/lib/errors';
import { parseRequestBody } from '@/lib/errors';
import { CreateConversationSchema, ConversationQuerySchema } from '@/lib/validation';
import * as dbOps from '@/lib/db.operations';
import { createAuditLog } from '@/lib/db.operations';
import { addRateLimitHeaders } from '@/lib/middleware/rateLimit';

/**
 * GET /api/conversations
 * List all conversations for authenticated user
 */
export const GET = createApiHandler(
  async (request: NextRequest, userId: string, requestId: string) => {
    try {
      // Parse and validate query parameters
      const url = new URL(request.url);
      const queryData = {
        page: url.searchParams.get('page') || '1',
        limit: url.searchParams.get('limit') || '20',
        sort: url.searchParams.get('sort') || 'created_at',
        order: url.searchParams.get('order') || 'desc',
        status: url.searchParams.get('status'),
      };

      const validatedQuery = ConversationQuerySchema.parse(queryData);

      // Calculate offset
      const offset = (validatedQuery.page - 1) * validatedQuery.limit;

      // Fetch conversations from database
      const conversations = await dbOps.listConversations(userId, {
        status: validatedQuery.status,
        limit: validatedQuery.limit,
        offset,
      });

      // Log the action
      await createAuditLog(userId, {
        action: 'list_conversations',
        resource_type: 'conversation',
      });

      const response = formatSuccessResponse(
        {
          conversations,
          pagination: {
            page: validatedQuery.page,
            limit: validatedQuery.limit,
            offset,
          },
        },
        200,
        requestId
      );

      return addRateLimitHeaders(response, request, '/api/conversations');
    } catch (error) {
      if (error instanceof Error) {
        return formatErrorResponse(
          'INVALID_INPUT',
          error.message,
          400,
          undefined,
          requestId
        );
      }
      throw error;
    }
  },
  { requireAuth: true }
);

/**
 * POST /api/conversations
 * Create a new conversation
 */
export const POST = createApiHandler(
  async (request: NextRequest, userId: string, requestId: string) => {
    try {
      // Parse and validate request body
      const parseResult = await parseRequestBody(request, CreateConversationSchema);
      if (!parseResult.success) {
        return parseResult.error;
      }

      const validatedData = parseResult.data;

      // Create conversation in database
      const conversation = await dbOps.createConversation(userId, {
        title: validatedData.title,
        pr_url: validatedData.pr_url,
        pr_data: validatedData.pr_data,
      });

      if (!conversation) {
        throw createErrors.internalError('Failed to create conversation');
      }

      // Log the action
      await createAuditLog(userId, {
        action: 'create_conversation',
        resource_type: 'conversation',
        resource_id: conversation.id,
        changes: { created: true },
      });

      const response = formatSuccessResponse(
        { conversation },
        201,
        requestId
      );

      return addRateLimitHeaders(response, request, '/api/conversations');
    } catch (error) {
      if (error instanceof Error) {
        return formatErrorResponse(
          'INTERNAL_ERROR',
          error.message,
          500,
          undefined,
          requestId
        );
      }
      throw error;
    }
  },
  { requireAuth: true }
);

import { formatErrorResponse } from '@/lib/errors';
