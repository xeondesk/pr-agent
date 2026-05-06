'use client';

import { useState } from 'react';

interface PRInputProps {
  onSubmit: (prUrl: string, diff: string) => void;
}

export function PRInput({ onSubmit }: PRInputProps) {
  const [prUrl, setPrUrl] = useState('');
  const [diff, setDiff] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = () => {
    if (prUrl.trim() || diff.trim()) {
      onSubmit(prUrl, diff);
      setPrUrl('');
      setDiff('');
      setIsExpanded(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="GitHub PR URL or repo link..."
        value={prUrl}
        onChange={(e) => setPrUrl(e.target.value)}
        onFocus={() => setIsExpanded(true)}
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
      />

      {isExpanded && (
        <div className="space-y-2 fade-in">
          <textarea
            placeholder="Or paste the diff here..."
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono text-xs h-24 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded transition-colors"
            >
              Analyze
            </button>
            <button
              onClick={() => {
                setIsExpanded(false);
                setPrUrl('');
                setDiff('');
              }}
              className="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-3 py-2 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
