'use client';

import { useState } from 'react';

interface WebhookConfigData {
  id?: string;
  repoFullName: string;
  webhookUrl?: string;
  enabled: boolean;
  autoReview: boolean;
  autoDescribe: boolean;
  autoImprove: boolean;
  postComments: boolean;
}

export function WebhookConfig() {
  const [repoName, setRepoName] = useState('');
  const [config, setConfig] = useState<WebhookConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFetchConfig = async () => {
    if (!repoName) {
      setError('Please enter a repository name (owner/repo)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/webhooks/config?repo=${encodeURIComponent(repoName)}`
      );

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      } else if (response.status === 404) {
        setConfig({
          repoFullName: repoName,
          enabled: false,
          autoReview: true,
          autoDescribe: true,
          autoImprove: false,
          postComments: true,
        });
      } else {
        throw new Error('Failed to fetch config');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/webhooks/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save config');
      }

      const data = await response.json();
      setConfig(data);
      setSuccess('Webhook configuration saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!repoName) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/webhooks/config?repo=${encodeURIComponent(repoName)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to disable webhook');
      }

      setConfig(null);
      setRepoName('');
      setSuccess('Webhook disabled');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-gray-900 rounded-lg border border-gray-800">
        <h2 className="text-2xl font-bold mb-6 text-white">GitHub Webhook Setup</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Repository (owner/repo)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="e.g., kubernetes/kubernetes"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              />
              <button
                onClick={handleFetchConfig}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900 border border-red-700 rounded text-red-100">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-900 border border-green-700 rounded text-green-100">
              {success}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-gray-900 rounded-lg border border-gray-800">
      <h2 className="text-2xl font-bold mb-6 text-white">
        Webhook Configuration for {config.repoFullName}
      </h2>

      {config.webhookUrl && (
        <div className="mb-6 p-4 bg-blue-900 border border-blue-700 rounded">
          <p className="text-sm text-blue-100 mb-2">GitHub Webhook URL:</p>
          <code className="text-xs text-blue-50 break-all">{config.webhookUrl}</code>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="autoReview"
            checked={config.autoReview}
            onChange={(e) =>
              setConfig({ ...config, autoReview: e.target.checked })
            }
            className="w-4 h-4 rounded"
          />
          <label htmlFor="autoReview" className="text-white">
            Auto-run PR Review on push
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="autoDescribe"
            checked={config.autoDescribe}
            onChange={(e) =>
              setConfig({ ...config, autoDescribe: e.target.checked })
            }
            className="w-4 h-4 rounded"
          />
          <label htmlFor="autoDescribe" className="text-white">
            Auto-run PR Description on push
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="autoImprove"
            checked={config.autoImprove}
            onChange={(e) =>
              setConfig({ ...config, autoImprove: e.target.checked })
            }
            className="w-4 h-4 rounded"
          />
          <label htmlFor="autoImprove" className="text-white">
            Auto-run Code Improvements
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="postComments"
            checked={config.postComments}
            onChange={(e) =>
              setConfig({ ...config, postComments: e.target.checked })
            }
            className="w-4 h-4 rounded"
          />
          <label htmlFor="postComments" className="text-white">
            Post results as PR comments
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded text-red-100">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-900 border border-green-700 rounded text-green-100">
          {success}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSaveConfig}
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
        <button
          onClick={handleDisable}
          disabled={loading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
        >
          Disable Webhook
        </button>
        <button
          onClick={() => {
            setConfig(null);
            setRepoName('');
          }}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
        >
          Back
        </button>
      </div>
    </div>
  );
}
