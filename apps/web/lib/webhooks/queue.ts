import { createClient } from '@supabase/supabase-js';
import { getNextRetryTime, logWebhookDelivery } from './security';

/**
 * Webhook Event Queue System
 * Handles reliable delivery with retries and exponential backoff
 */

export interface QueuedWebhookEvent {
  id: string;
  userId: string;
  webhookConfigId: string;
  eventData: any;
  deliveryId: string;
  attempt: number;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'dead_letter';
  error?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_RETRY_ATTEMPTS = 5;
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Enqueue a webhook event for processing
 */
export async function enqueueWebhookEvent(
  userId: string,
  webhookConfigId: string,
  eventData: any,
  deliveryId: string
): Promise<QueuedWebhookEvent | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('webhook_event_queue')
      .insert({
        user_id: userId,
        webhook_config_id: webhookConfigId,
        event_data: eventData,
        delivery_id: deliveryId,
        attempt: 0,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as QueuedWebhookEvent;
  } catch (error) {
    console.error('[v0] Error enqueuing webhook event:', error);
    return null;
  }
}

/**
 * Get next pending webhook event to process
 */
export async function getNextPendingEvent(): Promise<QueuedWebhookEvent | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('webhook_event_queue')
      .select('*')
      .in('status', ['pending', 'retrying'])
      .or(`next_retry_at.is.null,next_retry_at.lte."${now}"`)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data ? (data as QueuedWebhookEvent) : null;
  } catch (error) {
    console.error('[v0] Error getting next pending event:', error);
    return null;
  }
}

/**
 * Mark event as processing
 */
export async function markEventAsProcessing(eventId: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase
      .from('webhook_event_queue')
      .update({ status: 'processing' })
      .eq('id', eventId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[v0] Error marking event as processing:', error);
    return false;
  }
}

/**
 * Mark event as successful
 */
export async function markEventAsSuccess(eventId: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase
      .from('webhook_event_queue')
      .update({ status: 'success' })
      .eq('id', eventId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[v0] Error marking event as success:', error);
    return false;
  }
}

/**
 * Schedule retry for failed event
 */
export async function scheduleRetry(
  eventId: string,
  error: string
): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get current attempt count
    const { data: event, error: fetchError } = await supabase
      .from('webhook_event_queue')
      .select('attempt')
      .eq('id', eventId)
      .single();

    if (fetchError || !event) {
      throw fetchError || new Error('Event not found');
    }

    const nextAttempt = event.attempt + 1;

    if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
      // Move to dead letter queue
      const { error: updateError } = await supabase
        .from('webhook_event_queue')
        .update({
          status: 'dead_letter',
          error,
        })
        .eq('id', eventId);

      if (updateError) throw updateError;
      return true;
    }

    // Schedule next retry
    const nextRetryAt = getNextRetryTime(nextAttempt);

    const { error: updateError } = await supabase
      .from('webhook_event_queue')
      .update({
        status: 'retrying',
        attempt: nextAttempt,
        next_retry_at: nextRetryAt.toISOString(),
        error,
      })
      .eq('id', eventId);

    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error('[v0] Error scheduling retry:', error);
    return false;
  }
}

/**
 * Get dead letter queue events (failed beyond max retries)
 */
export async function getDeadLetterEvents(userId: string, limit: number = 100) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('webhook_event_queue')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'dead_letter')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []) as QueuedWebhookEvent[];
  } catch (error) {
    console.error('[v0] Error getting dead letter events:', error);
    return [];
  }
}

/**
 * Requeue a dead letter event for reprocessing
 */
export async function requeueDeadLetterEvent(eventId: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase
      .from('webhook_event_queue')
      .update({
        status: 'retrying',
        attempt: 0,
        error: null,
        next_retry_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[v0] Error requeuing event:', error);
    return false;
  }
}

/**
 * Get webhook processing statistics
 */
export async function getWebhookStats(userId: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('webhook_event_queue')
      .select('status')
      .eq('user_id', userId);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      pending: data?.filter((e) => e.status === 'pending').length || 0,
      processing: data?.filter((e) => e.status === 'processing').length || 0,
      success: data?.filter((e) => e.status === 'success').length || 0,
      failed: data?.filter((e) => e.status === 'failed').length || 0,
      deadLetter: data?.filter((e) => e.status === 'dead_letter').length || 0,
    };

    return stats;
  } catch (error) {
    console.error('[v0] Error getting webhook stats:', error);
    return null;
  }
}
