import { createErrors, logger } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/auth/server';
import type {
  Conversation,
  ConversationMessage,
  WebhookConfig,
  WebhookEvent,
  Feedback,
} from '@/lib/db';

/**
 * Safe database operations wrapper
 * All database operations should go through these functions
 */

// ============================================================================
// Conversation Operations
// ============================================================================

export async function createConversation(
  userId: string,
  data: {
    title: string;
    pr_url?: string;
    pr_data?: Record<string, any>;
  }
): Promise<Conversation | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      logger.error('createConversation: Supabase admin client not available');
      throw createErrors.supabaseError();
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        title: data.title,
        pr_url: data.pr_url,
        pr_data: data.pr_data,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      logger.error('createConversation error', error);
      throw createErrors.supabaseError({ message: error.message });
    }

    return conversation;
  } catch (error) {
    logger.error('createConversation failed', error);
    throw error;
  }
}

export async function getConversation(
  userId: string,
  conversationId: string
): Promise<Conversation | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data, error } = await supabase
      .from('conversations')
      .select()
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (error?.code === 'PGRST116') {
      // Not found
      return null;
    }

    if (error) {
      logger.error('getConversation error', error);
      throw createErrors.supabaseError();
    }

    return data;
  } catch (error) {
    logger.error('getConversation failed', error);
    throw error;
  }
}

export async function listConversations(
  userId: string,
  options?: {
    status?: 'active' | 'archived';
    limit?: number;
    offset?: number;
  }
): Promise<Conversation[]> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    let query = supabase
      .from('conversations')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 20)) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('listConversations error', error);
      throw createErrors.supabaseError();
    }

    return data || [];
  } catch (error) {
    logger.error('listConversations failed', error);
    throw error;
  }
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  updates: Partial<Conversation>
): Promise<Conversation | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data, error } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error?.code === 'PGRST116') {
      return null;
    }

    if (error) {
      logger.error('updateConversation error', error);
      throw createErrors.supabaseError();
    }

    return data;
  } catch (error) {
    logger.error('updateConversation failed', error);
    throw error;
  }
}

export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      logger.error('deleteConversation error', error);
      throw createErrors.supabaseError();
    }

    return true;
  } catch (error) {
    logger.error('deleteConversation failed', error);
    throw error;
  }
}

// ============================================================================
// Conversation Message Operations
// ============================================================================

export async function createMessage(
  conversationId: string,
  data: {
    role: 'user' | 'assistant';
    content: string;
    capability?: string;
    metadata?: Record<string, any>;
    tokens_used?: number;
    execution_time_ms?: number;
  }
): Promise<ConversationMessage | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data: message, error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        ...data,
      })
      .select()
      .single();

    if (error) {
      logger.error('createMessage error', error);
      throw createErrors.supabaseError();
    }

    return message;
  } catch (error) {
    logger.error('createMessage failed', error);
    throw error;
  }
}

export async function getConversationMessages(
  conversationId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<ConversationMessage[]> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    let query = supabase
      .from('conversation_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 20)) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('getConversationMessages error', error);
      throw createErrors.supabaseError();
    }

    return data || [];
  } catch (error) {
    logger.error('getConversationMessages failed', error);
    throw error;
  }
}

// ============================================================================
// Webhook Config Operations
// ============================================================================

export async function createWebhookConfig(
  userId: string,
  data: {
    repo_full_name: string;
    webhook_secret_hash: string;
    webhook_url: string;
    auto_review?: boolean;
    auto_describe?: boolean;
    auto_improve?: boolean;
    post_comments?: boolean;
    github_token_hash?: string;
  }
): Promise<WebhookConfig | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data: config, error } = await supabase
      .from('webhook_configs')
      .insert({
        user_id: userId,
        ...data,
      })
      .select()
      .single();

    if (error?.code === '23505') {
      // Unique constraint violation
      throw createErrors.alreadyExists(`Webhook for ${data.repo_full_name}`);
    }

    if (error) {
      logger.error('createWebhookConfig error', error);
      throw createErrors.supabaseError();
    }

    return config;
  } catch (error) {
    logger.error('createWebhookConfig failed', error);
    throw error;
  }
}

export async function getWebhookConfig(
  userId: string,
  configId: string
): Promise<WebhookConfig | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data, error } = await supabase
      .from('webhook_configs')
      .select()
      .eq('id', configId)
      .eq('user_id', userId)
      .single();

    if (error?.code === 'PGRST116') {
      return null;
    }

    if (error) {
      logger.error('getWebhookConfig error', error);
      throw createErrors.supabaseError();
    }

    return data;
  } catch (error) {
    logger.error('getWebhookConfig failed', error);
    throw error;
  }
}

export async function listWebhookConfigs(
  userId: string,
  options?: { enabled?: boolean }
): Promise<WebhookConfig[]> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    let query = supabase
      .from('webhook_configs')
      .select()
      .eq('user_id', userId);

    if (options?.enabled !== undefined) {
      query = query.eq('enabled', options.enabled);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('listWebhookConfigs error', error);
      throw createErrors.supabaseError();
    }

    return data || [];
  } catch (error) {
    logger.error('listWebhookConfigs failed', error);
    throw error;
  }
}

export async function updateWebhookConfig(
  userId: string,
  configId: string,
  updates: Partial<WebhookConfig>
): Promise<WebhookConfig | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data, error } = await supabase
      .from('webhook_configs')
      .update(updates)
      .eq('id', configId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error?.code === 'PGRST116') {
      return null;
    }

    if (error) {
      logger.error('updateWebhookConfig error', error);
      throw createErrors.supabaseError();
    }

    return data;
  } catch (error) {
    logger.error('updateWebhookConfig failed', error);
    throw error;
  }
}

export async function deleteWebhookConfig(
  userId: string,
  configId: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { error } = await supabase
      .from('webhook_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId);

    if (error) {
      logger.error('deleteWebhookConfig error', error);
      throw createErrors.supabaseError();
    }

    return true;
  } catch (error) {
    logger.error('deleteWebhookConfig failed', error);
    throw error;
  }
}

// ============================================================================
// Webhook Event Operations
// ============================================================================

export async function createWebhookEvent(
  webhookConfigId: string,
  data: {
    pr_number: number;
    action: string;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    tools?: string[];
    results?: Record<string, any>;
    error?: string;
  }
): Promise<WebhookEvent | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data: event, error } = await supabase
      .from('webhook_events')
      .insert({
        webhook_config_id: webhookConfigId,
        ...data,
      })
      .select()
      .single();

    if (error) {
      logger.error('createWebhookEvent error', error);
      throw createErrors.supabaseError();
    }

    return event;
  } catch (error) {
    logger.error('createWebhookEvent failed', error);
    throw error;
  }
}

export async function updateWebhookEvent(
  eventId: string,
  updates: Partial<WebhookEvent>
): Promise<WebhookEvent | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data, error } = await supabase
      .from('webhook_events')
      .update(updates)
      .eq('id', eventId)
      .select()
      .single();

    if (error) {
      logger.error('updateWebhookEvent error', error);
      throw createErrors.supabaseError();
    }

    return data;
  } catch (error) {
    logger.error('updateWebhookEvent failed', error);
    throw error;
  }
}

// ============================================================================
// Feedback Operations
// ============================================================================

export async function createFeedback(
  userId: string,
  messageId: string,
  data: {
    rating: number;
    comment?: string;
    helpful?: boolean;
  }
): Promise<Feedback | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw createErrors.supabaseError();

    const { data: feedback, error } = await supabase
      .from('feedback')
      .insert({
        conversation_message_id: messageId,
        ...data,
      })
      .select()
      .single();

    if (error) {
      logger.error('createFeedback error', error);
      throw createErrors.supabaseError();
    }

    return feedback;
  } catch (error) {
    logger.error('createFeedback failed', error);
    throw error;
  }
}

// ============================================================================
// Audit Log Operations
// ============================================================================

export async function createAuditLog(
  userId: string,
  data: {
    action: string;
    resource_type: string;
    resource_id?: string;
    changes?: Record<string, any>;
    ip_address?: string;
    user_agent?: string;
  }
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      logger.error('createAuditLog: Supabase not available');
      return;
    }

    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        ...data,
      });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    logger.error('createAuditLog failed', error);
  }
}
