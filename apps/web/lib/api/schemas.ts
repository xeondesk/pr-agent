import { z } from 'zod/v4';

const githubPrRegex = /github\.com\/.+\/.+\/pull\/\d+/;

export const prUrlSchema = z.string().url('Invalid PR URL').refine(
  (url) => githubPrRegex.test(url),
  { message: 'Must be a valid GitHub PR URL' }
);

export const diffSchema = z.string().max(1_000_000, 'Diff too large').optional();

export const userQuerySchema = z.string().min(1, 'Query is required').max(5000, 'Query too long');

function hasPrUrlOrDiff(data: { prUrl?: string; diff?: string }): boolean {
  return !!data.prUrl || !!data.diff;
}

export const askRequestSchema = z.object({
  prUrl: prUrlSchema.optional(),
  diff: diffSchema,
  userQuery: userQuerySchema,
}).refine(hasPrUrlOrDiff, { message: 'Either prUrl or diff is required' });

export type AskRequest = z.infer<typeof askRequestSchema>;

export const reviewRequestSchema = z.object({
  prUrl: prUrlSchema.optional(),
  diff: diffSchema,
  userQuery: userQuerySchema.optional(),
}).refine(hasPrUrlOrDiff, { message: 'Either prUrl or diff is required' });

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const describeRequestSchema = z.object({
  prUrl: prUrlSchema.optional(),
  diff: diffSchema,
  userQuery: userQuerySchema.optional(),
}).refine(hasPrUrlOrDiff, { message: 'Either prUrl or diff is required' });

export type DescribeRequest = z.infer<typeof describeRequestSchema>;

export const improveRequestSchema = z.object({
  prUrl: prUrlSchema.optional(),
  diff: diffSchema,
  userQuery: userQuerySchema.optional(),
}).refine(hasPrUrlOrDiff, { message: 'Either prUrl or diff is required' });

export type ImproveRequest = z.infer<typeof improveRequestSchema>;

export const agentsRequestSchema = z.object({
  prUrl: prUrlSchema.optional(),
  diff: diffSchema,
  mode: z.enum(['all', 'high', 'medium', 'low']).default('all'),
}).refine(hasPrUrlOrDiff, { message: 'Either prUrl or diff is required' });

export type AgentsRequest = z.infer<typeof agentsRequestSchema>;

export const capabilitiesRequestSchema = z.object({
  prUrl: prUrlSchema.optional(),
  diff: diffSchema,
  capabilities: z.union([z.string(), z.array(z.string())]),
  userQuery: userQuerySchema.optional(),
}).refine(hasPrUrlOrDiff, { message: 'Either prUrl or diff is required' });

export type CapabilitiesRequest = z.infer<typeof capabilitiesRequestSchema>;

export const webhookConfigRequestSchema = z.object({
  repoFullName: z.string().regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/, 'Invalid repo format'),
  autoReview: z.boolean().default(true),
  autoDescribe: z.boolean().default(true),
  autoImprove: z.boolean().default(false),
  postComments: z.boolean().default(true),
});

export type WebhookConfigRequest = z.infer<typeof webhookConfigRequestSchema>;

export const webhookConfigUpdateSchema = webhookConfigRequestSchema.partial();
export type WebhookConfigUpdate = z.infer<typeof webhookConfigUpdateSchema>;

export const conversationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  prUrl: prUrlSchema.optional(),
  prData: z.record(z.string(), z.unknown()).optional(),
});

export type ConversationCreate = z.infer<typeof conversationCreateSchema>;

export const messageCreateSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(50000),
  capability: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MessageCreate = z.infer<typeof messageCreateSchema>;

export const feedbackCreateSchema = z.object({
  messageId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  helpful: z.boolean(),
});

export type FeedbackCreate = z.infer<typeof feedbackCreateSchema>;
