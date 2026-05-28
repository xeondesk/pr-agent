'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseBrowserClient } from '@/lib/auth/client';
import type { Conversation, ConversationMessage } from '@/lib/db';

interface UseConversationsReturn {
  conversations: Conversation[];
  messages: ConversationMessage[];
  currentConversation: Conversation | null;
  loading: boolean;
  error: string | null;
  createConversation: (title: string, prUrl?: string) => Promise<Conversation | null>;
  selectConversation: (id: string) => Promise<void>;
  addMessage: (message: Omit<ConversationMessage, 'id' | 'createdAt'>) => Promise<ConversationMessage | null>;
}

export function useConversations(userId?: string): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const loadConversations = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;

        const { data, error: err } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });

        if (err) throw err;
        setConversations(data as Conversation[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, [userId]);

  const createConversation = useCallback(async (title: string, prUrl?: string) => {
    if (!userId) return null;

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return null;

      const { data, error: err } = await supabase
        .from('conversations')
        .insert({ user_id: userId, title, pr_url: prUrl })
        .select()
        .single();

      if (err) throw err;
      const conv = data as Conversation;
      setConversations((prev) => [conv, ...prev]);
      return conv;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create conversation');
      return null;
    }
  }, [userId]);

  const selectConversation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (convErr) throw convErr;
      setCurrentConversation(conv as Conversation);

      const { data: msgs, error: msgErr } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (msgErr) throw msgErr;
      setMessages(msgs as ConversationMessage[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, []);

  const addMessage = useCallback(async (message: Omit<ConversationMessage, 'id' | 'createdAt'>) => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return null;

      const { data, error: err } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: message.conversationId,
          role: message.role,
          content: message.content,
          capability: message.capability,
          metadata: message.metadata,
        })
        .select()
        .single();

      if (err) throw err;
      const msg = data as ConversationMessage;
      setMessages((prev) => [...prev, msg]);
      return msg;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save message');
      return null;
    }
  }, []);

  return {
    conversations,
    messages,
    currentConversation,
    loading,
    error,
    createConversation,
    selectConversation,
    addMessage,
  };
}
