'use client';

import { useState } from 'react';
import { PRInput } from './PRInput';
import { MessageHistory } from './MessageHistory';
import { ToolSelector } from './ToolSelector';
import type { Message } from '@pr-agent/types';

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('review');
  const [isLoading, setIsLoading] = useState(false);
  const [prData, setPrData] = useState<string>('');

  const handlePRSubmit = (prUrl: string, diff: string) => {
    setPrData(prUrl);
    
    // Add user message
    const userMessage: Message = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: `Analyzing PR: ${prUrl}`,
      timestamp: Date.now(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    
    // Execute tool
    executeAnalysis(prUrl, diff);
  };

  const handleQuery = (query: string) => {
    if (!prData) {
      alert('Please submit a PR first');
      return;
    }

    const userMessage: Message = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    executeAnalysis(prData, '', query);
  };

  const executeAnalysis = async (prUrl: string, diff: string = '', userQuery: string = '') => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/${selectedTool}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl, diff, userQuery }),
      });

      if (!response.ok) {
        throw new Error('API error');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullContent = '';

      const assistantMessage: Message = {
        id: Math.random().toString(36).slice(2),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolUsed: selectedTool,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        fullContent += text;

        // Update last message
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: fullContent,
            };
          }
          return updated;
        });
      }
    } catch (error) {
      const errorMessage: Message = {
        id: Math.random().toString(36).slice(2),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex w-full h-screen gap-4 p-4 bg-slate-900">
      {/* Left Panel - Chat */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 flex flex-col gap-4 bg-slate-800 rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-white">PR-Agent</h1>
          </div>
          
          <MessageHistory messages={messages} isLoading={isLoading} />
        </div>

        {/* Input Area */}
        <div className="bg-slate-800 rounded-lg p-4 space-y-3">
          <PRInput onSubmit={handlePRSubmit} />
          
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask a question about the PR..."
              disabled={!prData || isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value && !isLoading) {
                  handleQuery(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
              }}
              className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              onClick={() => {
                const input = document.querySelector('input[placeholder*="Ask"]') as HTMLInputElement;
                if (input?.value && !isLoading) {
                  handleQuery(input.value);
                  input.value = '';
                }
              }}
              disabled={!prData || isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-2 rounded transition-colors"
            >
              {isLoading ? 'Processing...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Tools */}
      <div className="w-64 bg-slate-800 rounded-lg p-4 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">Analysis Tools</h2>
          <ToolSelector selectedTool={selectedTool} onSelectTool={setSelectedTool} />
        </div>
        
        <div className="flex-1 bg-slate-700 rounded p-3 text-sm text-slate-300 overflow-auto">
          <h3 className="font-semibold mb-2">Status</h3>
          <p>{isLoading ? 'Analyzing...' : prData ? 'Ready' : 'Waiting for PR'}</p>
        </div>
      </div>
    </div>
  );
}
