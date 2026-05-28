-- Migration: Initial Database Schema
-- Created: 2026-05-28
-- Description: Complete production-ready schema for PR-Agent

-- Create Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for full-text search

-- User Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);

-- API Keys for tracking and rate limiting
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  rotated_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_user_api_keys_user_id ON public.user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_key_hash ON public.user_api_keys(key_hash);

-- Conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pr_url TEXT,
  pr_data JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user_id_created ON public.conversations(user_id, created_at DESC);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_pr_url ON public.conversations(pr_url);

-- Conversation Messages with full-text search
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  capability TEXT,
  metadata JSONB,
  tokens_used INTEGER,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversation_messages_conversation_id ON public.conversation_messages(conversation_id);
CREATE INDEX idx_conversation_messages_role ON public.conversation_messages(role);
CREATE INDEX idx_conversation_messages_created ON public.conversation_messages(created_at DESC);
-- Full-text search index
CREATE INDEX idx_conversation_messages_content_fts ON public.conversation_messages USING GIN (to_tsvector('english', content));

-- Webhook Configurations
CREATE TABLE IF NOT EXISTS public.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  webhook_secret_hash TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  auto_review BOOLEAN DEFAULT TRUE,
  auto_describe BOOLEAN DEFAULT TRUE,
  auto_improve BOOLEAN DEFAULT FALSE,
  post_comments BOOLEAN DEFAULT TRUE,
  github_token_hash TEXT, -- encrypted GitHub token for PR comments
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, repo_full_name)
);

CREATE INDEX idx_webhook_configs_user_id ON public.webhook_configs(user_id);
CREATE INDEX idx_webhook_configs_enabled ON public.webhook_configs(enabled);
CREATE INDEX idx_webhook_configs_repo ON public.webhook_configs(repo_full_name);

-- Webhook Events with retention policy
CREATE TABLE IF NOT EXISTS public.webhook_events (
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

CREATE INDEX idx_webhook_events_config_id_created ON public.webhook_events(webhook_config_id, created_at DESC);
CREATE INDEX idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX idx_webhook_events_completed ON public.webhook_events(completed_at DESC) WHERE status = 'completed';

-- Feedback & Ratings
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_message_id UUID NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  helpful BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_message_id ON public.feedback(conversation_message_id);
CREATE INDEX idx_feedback_rating ON public.feedback(rating);

-- Audit Logs for security and compliance
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id_created ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

-- API Usage Tracking for rate limiting
CREATE TABLE IF NOT EXISTS public.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_user_id ON public.api_usage(user_id);
CREATE INDEX idx_api_usage_created ON public.api_usage(created_at DESC);
CREATE INDEX idx_api_usage_user_created ON public.api_usage(user_id, created_at DESC);

-- Enable RLS (Row Level Security) on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
DROP POLICY IF EXISTS "users_read_own_profile" ON public.user_profiles;
CREATE POLICY "users_read_own_profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON public.user_profiles;
CREATE POLICY "users_update_own_profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.user_profiles;
CREATE POLICY "users_insert_own_profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for user_api_keys
DROP POLICY IF EXISTS "users_read_own_api_keys" ON public.user_api_keys;
CREATE POLICY "users_read_own_api_keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_create_own_api_keys" ON public.user_api_keys;
CREATE POLICY "users_create_own_api_keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_api_keys" ON public.user_api_keys;
CREATE POLICY "users_delete_own_api_keys" ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for conversations
DROP POLICY IF EXISTS "users_read_own_conversations" ON public.conversations;
CREATE POLICY "users_read_own_conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_create_own_conversations" ON public.conversations;
CREATE POLICY "users_create_own_conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_conversations" ON public.conversations;
CREATE POLICY "users_update_own_conversations" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_conversations" ON public.conversations;
CREATE POLICY "users_delete_own_conversations" ON public.conversations
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for conversation_messages
DROP POLICY IF EXISTS "users_read_own_messages" ON public.conversation_messages;
CREATE POLICY "users_read_own_messages" ON public.conversation_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_create_own_messages" ON public.conversation_messages;
CREATE POLICY "users_create_own_messages" ON public.conversation_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- RLS Policies for webhook_configs
DROP POLICY IF EXISTS "users_read_own_webhook_configs" ON public.webhook_configs;
CREATE POLICY "users_read_own_webhook_configs" ON public.webhook_configs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_create_own_webhook_configs" ON public.webhook_configs;
CREATE POLICY "users_create_own_webhook_configs" ON public.webhook_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_webhook_configs" ON public.webhook_configs;
CREATE POLICY "users_update_own_webhook_configs" ON public.webhook_configs
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_webhook_configs" ON public.webhook_configs;
CREATE POLICY "users_delete_own_webhook_configs" ON public.webhook_configs
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for webhook_events
DROP POLICY IF EXISTS "users_read_own_webhook_events" ON public.webhook_events;
CREATE POLICY "users_read_own_webhook_events" ON public.webhook_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM webhook_configs
      WHERE webhook_configs.id = webhook_events.webhook_config_id
      AND webhook_configs.user_id = auth.uid()
    )
  );

-- RLS Policies for feedback
DROP POLICY IF EXISTS "users_read_own_feedback" ON public.feedback;
CREATE POLICY "users_read_own_feedback" ON public.feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_messages
      JOIN conversations ON conversations.id = conversation_messages.conversation_id
      WHERE conversation_messages.id = feedback.conversation_message_id
      AND conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_create_own_feedback" ON public.feedback;
CREATE POLICY "users_create_own_feedback" ON public.feedback
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_messages
      JOIN conversations ON conversations.id = conversation_messages.conversation_id
      WHERE conversation_messages.id = feedback.conversation_message_id
      AND conversations.user_id = auth.uid()
    )
  );

-- RLS Policies for audit_logs (users can only read their own)
DROP POLICY IF EXISTS "users_read_own_audit_logs" ON public.audit_logs;
CREATE POLICY "users_read_own_audit_logs" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for api_usage (users can read their own)
DROP POLICY IF EXISTS "users_read_own_api_usage" ON public.api_usage;
CREATE POLICY "users_read_own_api_usage" ON public.api_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger to update user_profiles updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_timestamp ON public.user_profiles;
CREATE TRIGGER update_user_profiles_timestamp
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profiles_timestamp();

-- Trigger to update conversations updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_timestamp ON public.conversations;
CREATE TRIGGER update_conversations_timestamp
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION update_conversations_timestamp();

-- Trigger to update webhook_configs updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_configs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_webhook_configs_timestamp ON public.webhook_configs;
CREATE TRIGGER update_webhook_configs_timestamp
BEFORE UPDATE ON public.webhook_configs
FOR EACH ROW
EXECUTE FUNCTION update_webhook_configs_timestamp();

-- Comment on tables for documentation
COMMENT ON TABLE public.user_profiles IS 'Extended user information beyond Supabase auth.users';
COMMENT ON TABLE public.conversations IS 'PR analysis conversation sessions';
COMMENT ON TABLE public.conversation_messages IS 'Messages within conversations (user queries and AI responses)';
COMMENT ON TABLE public.webhook_configs IS 'GitHub webhook configurations per repository';
COMMENT ON TABLE public.webhook_events IS 'Events triggered by GitHub webhooks with processing status';
COMMENT ON TABLE public.audit_logs IS 'Security audit trail of user actions';
COMMENT ON TABLE public.api_usage IS 'API usage metrics for rate limiting and monitoring';
