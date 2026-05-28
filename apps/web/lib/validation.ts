import { z } from 'zod';

// Common schemas
export const UUIDSchema = z.string().uuid();
export const TimestampSchema = z.coerce.date();
export const RoleSchema = z.enum(['user', 'assistant']);

// User & Auth Schemas
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  avatar_url: z.string().url().optional(),
});

// API Key Schemas
export const CreateApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100),
});

// Conversation Schemas
export const CreateConversationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  pr_url: z.string().url().optional(),
  pr_data: z.record(z.unknown()).optional(),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export const ArchiveConversationSchema = z.object({
  conversation_id: UUIDSchema,
});

// Conversation Message Schemas
export const CreateMessageSchema = z.object({
  conversation_id: UUIDSchema,
  content: z.string().min(1, 'Message content is required').max(10000, 'Message is too long'),
  capability: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const FeedbackSchema = z.object({
  conversation_message_id: UUIDSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  helpful: z.boolean().optional(),
});

// Webhook Config Schemas
export const CreateWebhookConfigSchema = z.object({
  repo_full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Invalid repository name (use owner/repo format)'),
  webhook_secret: z.string().min(20, 'Webhook secret must be at least 20 characters'),
  auto_review: z.boolean().optional().default(true),
  auto_describe: z.boolean().optional().default(true),
  auto_improve: z.boolean().optional().default(false),
  post_comments: z.boolean().optional().default(true),
  github_token: z.string().optional(),
});

export const UpdateWebhookConfigSchema = z.object({
  webhook_id: UUIDSchema,
  auto_review: z.boolean().optional(),
  auto_describe: z.boolean().optional(),
  auto_improve: z.boolean().optional(),
  post_comments: z.boolean().optional(),
  enabled: z.boolean().optional(),
  github_token: z.string().optional(),
});

// API Endpoint Request Schemas
export const AskRequestSchema = z.object({
  pr_url: z.string().url().optional(),
  diff: z.string().max(5000000, 'Diff is too large').optional(),
  user_query: z.string().min(1, 'Query is required').max(5000),
  conversation_id: UUIDSchema.optional(),
  tools: z.array(z.string()).optional(),
});

export const ReviewRequestSchema = z.object({
  pr_url: z.string().url('Invalid PR URL').optional(),
  diff: z.string().max(5000000, 'Diff is too large').optional(),
  conversation_id: UUIDSchema.optional(),
});

export const DescribeRequestSchema = z.object({
  pr_url: z.string().url('Invalid PR URL').optional(),
  diff: z.string().max(5000000, 'Diff is too large').optional(),
  conversation_id: UUIDSchema.optional(),
});

export const ImproveRequestSchema = z.object({
  pr_url: z.string().url('Invalid PR URL').optional(),
  diff: z.string().max(5000000, 'Diff is too large').optional(),
  conversation_id: UUIDSchema.optional(),
});

export const AgentsRequestSchema = z.object({
  pr_url: z.string().url().optional(),
  diff: z.string().max(5000000, 'Diff is too large').optional(),
  mode: z.enum(['all', 'high', 'medium', 'low']).optional().default('all'),
});

export const CapabilitiesRequestSchema = z.object({
  pr_url: z.string().url().optional(),
  diff: z.string().max(5000000, 'Diff is too large').optional(),
  capabilities_list: z.array(z.string()).optional(),
  user_query: z.string().optional(),
});

// Webhook Event Schemas
export const WebhookPayloadSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().optional(),
    head: z.object({
      sha: z.string(),
    }),
    base: z.object({
      sha: z.string(),
    }),
  }),
  repository: z.object({
    full_name: z.string(),
    name: z.string(),
  }),
});

export const WebhookConfigPayloadSchema = z.object({
  repo_full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  webhook_secret: z.string().min(20),
  auto_review: z.boolean().optional(),
  auto_describe: z.boolean().optional(),
  auto_improve: z.boolean().optional(),
  post_comments: z.boolean().optional(),
});

// Query Parameter Schemas
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sort: z.enum(['created_at', 'updated_at']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const ConversationQuerySchema = z.object({
  ...PaginationSchema.shape,
  status: z.enum(['active', 'archived']).optional(),
});

// Rate Limiting Schemas
export const RateLimitSchema = z.object({
  user_id: z.string(),
  endpoint: z.string(),
  limit: z.number().positive(),
  window_ms: z.number().positive(),
});

// Error Response Schemas
export const ApiErrorSchema = z.object({
  status: z.literal('error'),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string().optional(),
});

export const ApiSuccessSchema = z.object({
  status: z.literal('success'),
  data: z.unknown().optional(),
  requestId: z.string().optional(),
});

// Type exports for use in API routes
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
export type CreateWebhookConfigInput = z.infer<typeof CreateWebhookConfigSchema>;
export type UpdateWebhookConfigInput = z.infer<typeof UpdateWebhookConfigSchema>;
export type AskRequestInput = z.infer<typeof AskRequestSchema>;
export type ReviewRequestInput = z.infer<typeof ReviewRequestSchema>;
export type DescribeRequestInput = z.infer<typeof DescribeRequestSchema>;
export type ImproveRequestInput = z.infer<typeof ImproveRequestSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type ConversationQueryInput = z.infer<typeof ConversationQuerySchema>;
