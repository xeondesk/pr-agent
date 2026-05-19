'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@pr-agent/types';

interface MessageHistoryProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageHistory({ messages, isLoading }: MessageHistoryProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <div className="text-4xl mb-2">🤖</div>
          <p>Submit a PR to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-100'
            }`}
          >
            {msg.toolUsed && (
              <div className="text-xs opacity-75 mb-1">[{msg.toolUsed}]</div>
            )}
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-slate-700 px-4 py-2 rounded-lg">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-slate-400 rounded-full pulse"></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
