'use client';

import { useState } from 'react';

interface CapabilityInfo {
  name: string;
  description: string;
}

interface AnalysisResult {
  capability: string;
  content: string;
  isLoading?: boolean;
  error?: string;
}

export function CapabilityAnalyzer() {
  const [prUrl, setPrUrl] = useState('');
  const [customDiff, setCustomDiff] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([
    'CodeReview',
    'Description',
  ]);
  const [availableCapabilities, setAvailableCapabilities] = useState<
    CapabilityInfo[]
  >([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available capabilities on mount
  const fetchCapabilities = async () => {
    try {
      const response = await fetch('/api/capabilities');
      const data = await response.json();
      setAvailableCapabilities(data.capabilities);
    } catch (err) {
      console.error('Failed to fetch capabilities:', err);
    }
  };

  const handleAnalyze = async () => {
    if (!prUrl && !customDiff) {
      setError('Please provide a PR URL or paste a diff');
      return;
    }

    if (capabilities.length === 0) {
      setError('Please select at least one capability');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(
      capabilities.map((cap) => ({
        capability: cap,
        content: '',
        isLoading: true,
      }))
    );

    try {
      const response = await fetch('/api/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prUrl: prUrl || undefined,
          diff: customDiff || undefined,
          capabilities,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let currentCapability = '';
      let currentContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              // Stream complete
              continue;
            }

            if (data.startsWith('[START]')) {
              currentCapability = data.slice(7).trim();
              currentContent = '';
            } else if (data.startsWith('[END]')) {
              setResults((prev) =>
                prev.map((r) =>
                  r.capability === currentCapability
                    ? {
                        ...r,
                        content: currentContent,
                        isLoading: false,
                      }
                    : r
                )
              );
            } else if (data.startsWith('[ERROR]')) {
              const errorMsg = data.slice(7).trim();
              setResults((prev) =>
                prev.map((r) =>
                  r.capability === currentCapability
                    ? {
                        ...r,
                        error: errorMsg,
                        isLoading: false,
                      }
                    : r
                )
              );
            } else if (currentCapability) {
              currentContent += data;
              setResults((prev) =>
                prev.map((r) =>
                  r.capability === currentCapability
                    ? { ...r, content: currentContent }
                    : r
                )
              );
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Input Panel */}
      <div className="bg-gray-800 border border-gray-700 rounded p-4">
        <div className="space-y-4">
          {/* PR URL Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              GitHub PR URL
            </label>
            <input
              type="text"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
            />
          </div>

          {/* Diff Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Or Paste Diff
            </label>
            <textarea
              value={customDiff}
              onChange={(e) => setCustomDiff(e.target.value)}
              placeholder="Paste your diff here..."
              className="w-full h-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono resize-none"
            />
          </div>

          {/* Capability Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Capabilities
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableCapabilities.length > 0 ? (
                availableCapabilities.map((cap) => (
                  <label key={cap.name} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={capabilities.includes(cap.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCapabilities([...capabilities, cap.name]);
                        } else {
                          setCapabilities(
                            capabilities.filter((c) => c !== cap.name)
                          );
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-300">{cap.name}</span>
                  </label>
                ))
              ) : (
                <button
                  onClick={fetchCapabilities}
                  className="col-span-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                >
                  Load Capabilities
                </button>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900 border border-red-700 rounded text-red-100 text-sm">
              {error}
            </div>
          )}

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white font-medium"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Results Panel */}
      {results.length > 0 && (
        <div className="flex-1 overflow-auto space-y-4">
          {results.map((result) => (
            <div
              key={result.capability}
              className="bg-gray-800 border border-gray-700 rounded overflow-hidden"
            >
              <div className="bg-gray-700 px-4 py-2 border-b border-gray-600">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  {result.capability}
                  {result.isLoading && (
                    <span className="animate-pulse text-blue-400">●</span>
                  )}
                </h4>
              </div>
              <div className="max-h-64 overflow-auto">
                {result.error ? (
                  <div className="p-3 text-red-400 text-sm">{result.error}</div>
                ) : (
                  <div className="p-3 text-gray-300 text-sm whitespace-pre-wrap">
                    {result.content || (result.isLoading ? 'Processing...' : 'No output')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
