import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!supabase && supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabase;
}

// Database schema interfaces
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  prUrl?: string;
  prData?: Record<string, any>;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  capability?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface WebhookConfig {
  id: string;
  userId: string;
  repoFullName: string;
  webhookSecret: string;
  webhookUrl: string;
  enabled: boolean;
  autoReview: boolean;
  autoDescribe: boolean;
  autoImprove: boolean;
  postComments: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  webhookConfigId: string;
  prNumber: number;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tools: string[];
  results?: Record<string, string>;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface Feedback {
  id: string;
  conversationMessageId: string;
  rating: number;// 1-5
  comment?: string;
  helpful: boolean;
  createdAt: Date;
}

// SQL Schema Definition (for reference)
export const SCHEMA_SQL = `
-- Users table (managed by Supabase Auth)
-- public.auth.users

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pr_url TEXT,
  pr_data JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conversation messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  capability TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Webhook configurations
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL UNIQUE,
  webhook_secret TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  auto_review BOOLEAN DEFAULT TRUE,
  auto_describe BOOLEAN DEFAULT TRUE,
  auto_improve BOOLEAN DEFAULT FALSE,
  post_comments BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  tools TEXT[] NOT NULL DEFAULT '{}',
  results JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_message_id UUID NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  helpful BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indices
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_user_id ON webhook_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_config_id ON webhook_events(webhook_config_id);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" ON conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations" ON conversations
  FOR DELETE USING (auth.uid() = user_id);

-- Similar policies for conversation_messages, webhook_configs, webhook_events, feedback
`;

// Database operations
export async function saveConversation(
  userId: string,
  conversation: Omit<Conversation, 'id'>
): Promise<Conversation | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await (client
      .from('conversations')
      .insert([
        {
          user_id: userId,
          title: conversation.title,
          pr_url: conversation.prUrl || null,
          pr_data: conversation.prData || null,
          status: conversation.status,
        },
      ] as any)
      .select()
      .single());

    if (error) {
      console.error('Failed to save conversation:', error);
      return null;
    }

    return data as Conversation;
  } catch (err) {
    console.error('Error saving conversation:', err);
    return null;
  }
}

export async function saveMessage(
  conversationId: string,
  message: Omit<ConversationMessage, 'id' | 'createdAt'>
): Promise<ConversationMessage | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await (client
      .from('conversation_messages')
      .insert([
        {
          conversation_id: conversationId,
          role: message.role,
          content: message.content,
          capability: message.capability || null,
          metadata: message.metadata || null,
        },
      ] as any)
      .select()
      .single());

    if (error) {
      console.error('Failed to save message:', error);
      return null;
    }

    return data as ConversationMessage;
  } catch (err) {
    console.error('Error saving message:', err);
    return null;
  }
}

export async function saveFeedback(
  messageId: string,
  feedback: Omit<Feedback, 'id' | 'createdAt'>
): Promise<Feedback | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await (client
      .from('feedback')
      .insert([
        {
          conversation_message_id: messageId,
          rating: feedback.rating,
          comment: feedback.comment || null,
          helpful: feedback.helpful || null,
        },
      ] as any)
      .select()
      .single());

    if (error) {
      console.error('Failed to save feedback:', error);
      return null;
    }

    return data as Feedback;
  } catch (err) {
    console.error('Error saving feedback:', err);
    return null;
  }
}
