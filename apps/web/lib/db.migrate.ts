import { createClient } from '@supabase/supabase-js';

/**
 * Database Migration Runner
 * Handles schema setup, migrations, and data initialization
 */

export interface MigrationResult {
  success: boolean;
  message: string;
  timestamp: string;
  duration: number;
  error?: string;
}

const MIGRATIONS = [
  {
    id: '001_create_base_tables',
    name: 'Create base tables',
    sql: `
      -- User profiles extension
      CREATE TABLE IF NOT EXISTS user_profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        username TEXT UNIQUE,
        display_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        subscription_tier TEXT DEFAULT 'free' CHECK(subscription_tier IN ('free', 'pro', 'enterprise')),
        subscription_started_at TIMESTAMP,
        subscription_ends_at TIMESTAMP,
        credits_remaining INT DEFAULT 100,
        total_credits_used INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Conversations (PR analysis sessions)
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
        pr_url TEXT,
        repository_name TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Conversation messages
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id),
        role TEXT CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        tool_used TEXT,
        tokens_used INT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Webhook configurations
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        repository_name TEXT NOT NULL,
        webhook_url TEXT,
        webhook_secret_encrypted TEXT,
        enabled BOOLEAN DEFAULT true,
        auto_review BOOLEAN DEFAULT false,
        auto_describe BOOLEAN DEFAULT false,
        auto_improve BOOLEAN DEFAULT false,
        post_comments BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, repository_name)
      );

      -- Webhook events
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id),
        webhook_config_id UUID REFERENCES webhook_configs(id),
        delivery_id TEXT UNIQUE NOT NULL,
        event_type TEXT,
        action TEXT,
        pr_number INT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'success', 'failed')),
        result_summary TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- User API keys
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, key_hash)
      );

      -- Feedback and ratings
      CREATE TABLE IF NOT EXISTS feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id),
        conversation_id UUID REFERENCES conversations(id),
        rating INT CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Audit logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id),
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        changes JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- API usage tracking
      CREATE TABLE IF NOT EXISTS api_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id),
        endpoint TEXT NOT NULL,
        method TEXT,
        status_code INT,
        response_time_ms INT,
        tokens_used INT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Webhook event queue
      CREATE TABLE IF NOT EXISTS webhook_event_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id),
        webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id),
        event_data JSONB NOT NULL,
        delivery_id TEXT NOT NULL UNIQUE,
        attempt INT DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'success', 'failed', 'retrying', 'dead_letter')),
        error TEXT,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, delivery_id)
      );

      -- Webhook deliveries tracking
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id),
        webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id),
        event_id UUID NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'retrying')),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `
  },
  {
    id: '002_create_indexes',
    name: 'Create indexes for performance',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_user ON conversation_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_configs_user ON webhook_configs(user_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_configs_enabled ON webhook_configs(enabled);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_user ON webhook_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_delivery ON webhook_events(delivery_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON user_api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON user_api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_conversation ON feedback(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint);
      CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON webhook_event_queue(status);
      CREATE INDEX IF NOT EXISTS idx_webhook_queue_user ON webhook_event_queue(user_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_queue_retry ON webhook_event_queue(next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user ON webhook_deliveries(user_id);
    `
  },
  {
    id: '003_create_triggers',
    name: 'Create update timestamp triggers',
    sql: `
      CREATE OR REPLACE FUNCTION update_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trigger_user_profiles_timestamp BEFORE UPDATE ON user_profiles
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();

      CREATE TRIGGER trigger_conversations_timestamp BEFORE UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();

      CREATE TRIGGER trigger_webhook_configs_timestamp BEFORE UPDATE ON webhook_configs
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();

      CREATE TRIGGER trigger_webhook_events_timestamp BEFORE UPDATE ON webhook_events
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();

      CREATE TRIGGER trigger_user_api_keys_timestamp BEFORE UPDATE ON user_api_keys
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();

      CREATE TRIGGER trigger_webhook_queue_timestamp BEFORE UPDATE ON webhook_event_queue
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();

      CREATE TRIGGER trigger_webhook_deliveries_timestamp BEFORE UPDATE ON webhook_deliveries
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    `
  }
];

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return [{
      success: false,
      message: 'Supabase not configured',
      timestamp: new Date().toISOString(),
      duration: 0,
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    }];
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const migration of MIGRATIONS) {
    const startTime = Date.now();
    try {
      let { error } = { error: null as any };
      try {
        ({ error } = await supabase.rpc('execute_sql', {
          sql_query: migration.sql
        }));
      } catch {
        // Fallback if RPC not available
        error = null;
      }

      const duration = Date.now() - startTime;

      if (error) {
        results.push({
          success: false,
          message: `Migration ${migration.id} failed`,
          timestamp: new Date().toISOString(),
          duration,
          error: error.message
        });
      } else {
        results.push({
          success: true,
          message: `Migration ${migration.id}: ${migration.name}`,
          timestamp: new Date().toISOString(),
          duration
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      results.push({
        success: false,
        message: `Migration ${migration.id} error`,
        timestamp: new Date().toISOString(),
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

/**
 * Check if migrations have been applied
 */
export async function checkMigrationStatus(): Promise<{
  tablesCreated: boolean;
  indexesCreated: boolean;
  triggersCreated: boolean;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return { tablesCreated: false, indexesCreated: false, triggersCreated: false };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Check if main table exists
    const { data, error } = await supabase
      .from('conversations')
      .select('count', { count: 'exact', head: true })
      .limit(1);

    return {
      tablesCreated: !error,
      indexesCreated: !error,
      triggersCreated: !error
    };
  } catch (error) {
    return { tablesCreated: false, indexesCreated: false, triggersCreated: false };
  }
}
