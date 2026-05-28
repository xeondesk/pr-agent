import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabase) return supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DB] Supabase not configured. Using in-memory fallback.');
    }
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-application-name': 'pr-agent',
      },
    },
    db: {
      schema: 'public',
    },
  });

  return supabase;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[DB] ${context} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`[DB] ${context} failed after ${maxRetries} retries`);
}

export async function executeQuery<T>(
  queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: any }>,
  context: string
): Promise<T> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(`Database not configured for: ${context}`);
  }

  return withRetry(async () => {
    const { data, error } = await queryFn(client);
    if (error) throw error;
    if (data === null || data === undefined) {
      throw new Error(`No data returned for: ${context}`);
    }
    return data;
  }, context);
}

export async function insertRecord<T extends Record<string, unknown>>(
  table: string,
  record: T,
  _context?: string
): Promise<T> {
  return executeQuery(
    (client) =>
      client.from(table).insert(record as any).select().single() as any,
    _context || `insert into ${table}`
  );
}

export async function updateRecord<T extends Record<string, unknown>>(
  table: string,
  match: Record<string, unknown>,
  updates: Partial<T>,
  _context?: string
): Promise<T> {
  return executeQuery(
    (client) => {
      let query = client.from(table).update(updates as any);
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value as any);
      }
      return query.select().single() as any;
    },
    _context || `update ${table}`
  );
}

export async function findRecord<T>(
  table: string,
  match: Record<string, unknown>,
  _context?: string
): Promise<T | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from(table).select('*');
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value as any);
    }
    const { data, error } = await query.single();
    if (error) return null;
    return data as T;
  } catch {
    return null;
  }
}

export async function deleteRecord(
  table: string,
  match: Record<string, unknown>,
  _context?: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    let query = client.from(table).delete();
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value as any);
    }
    const { error } = await query;
    return !error;
  } catch {
    return false;
  }
}

export type { SupabaseClient };

export interface Conversation {
  id: string;
  userId: string;
  user_id: string;
  title: string;
  prUrl?: string;
  pr_url?: string;
  prData?: Record<string, any>;
  pr_data?: Record<string, any>;
  status: 'active' | 'archived';
  createdAt: Date;
  created_at: string;
  updatedAt: Date;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  capability?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  created_at: string;
}

export interface WebhookConfig {
  id: string;
  userId: string;
  user_id: string;
  repoFullName: string;
  repo_full_name: string;
  webhookSecret: string;
  webhook_secret: string;
  webhookUrl: string;
  webhook_url: string;
  enabled: boolean;
  autoReview: boolean;
  auto_review: boolean;
  autoDescribe: boolean;
  auto_describe: boolean;
  autoImprove: boolean;
  auto_improve: boolean;
  postComments: boolean;
  post_comments: boolean;
  createdAt: Date;
  created_at: string;
  updatedAt: Date;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  webhookConfigId: string;
  webhook_config_id: string;
  prNumber: number;
  pr_number: number;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tools: string[];
  results?: Record<string, string>;
  error?: string;
  createdAt: Date;
  created_at: string;
  completedAt?: Date;
  completed_at?: string;
}

export interface Feedback {
  id: string;
  conversationMessageId: string;
  conversation_message_id: string;
  rating: number;
  comment?: string;
  helpful: boolean;
  createdAt: Date;
  created_at: string;
}

export const SCHEMA_SQL = `
-- See lib/db/migrations/ for full schema
`;
