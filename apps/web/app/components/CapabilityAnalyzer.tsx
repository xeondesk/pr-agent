'use client';

import { useState } from 'react';
import styles from './CapabilityAnalyzer.module.css';

interface CapabilityAnalyzerProps {
  prUrl: string;
}

interface AnalysisResult {
  capability: string;
  content: string;
  isLoading?: boolean;
  error?: string;
}

const CAPABILITIES = [
  { id: 'review', name: 'Code Review', icon: '👀' },
  { id: 'security', name: 'Security', icon: '🔒' },
  { id: 'performance', name: 'Performance', icon: '⚡' },
  { id: 'tests', name: 'Test Coverage', icon: '✅' },
];

export function CapabilityAnalyzer({ prUrl }: CapabilityAnalyzerProps) {
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([
    'review',
  ]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCapability = (id: string) => {
    setSelectedCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleAnalyze = async () => {
    if (!prUrl) {
      setError('Please provide a PR URL');
      return;
    }
    if (selectedCapabilities.length === 0) {
      setError('Please select at least one analysis');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(
      selectedCapabilities.map((id) => ({
        capability: CAPABILITIES.find((c) => c.id === id)?.name || id,
        content: '',
        isLoading: true,
      }))
    );

    try {
      for (const capId of selectedCapabilities) {
        const capName =
          CAPABILITIES.find((c) => c.id === capId)?.name || capId;

        const response = await fetch(`/api/${capId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prUrl, userQuery: '' }),
        });

        if (!response.ok) throw new Error(`Failed to analyze ${capName}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let content = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          content += decoder.decode(value, { stream: true });

          setResults((prev) => {
            const idx = prev.findIndex((r) => r.capability === capName);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                content,
                isLoading: false,
              };
              return updated;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Analysis failed';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarSection}>
          <h3 className={styles.sectionTitle}>Analysis Tools</h3>
          <div className={styles.capabilityGrid}>
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.id}
                className={`${styles.capabilityCard} ${
                  selectedCapabilities.includes(cap.id) ? styles.active : ''
                }`}
                onClick={() => toggleCapability(cap.id)}
              >
                <div className={styles.capabilityLabel}>
                  <span className={styles.capabilityIcon}>{cap.icon}</span>
                  <span>{cap.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || selectedCapabilities.length === 0}
          className={styles.actionButton}
        >
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </aside>

      <main className={styles.mainContent}>
        {error && (
          <div className={styles.errorMessage}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && results.length === 0 && (
          <div className={styles.loadingCard}>
            <div className={styles.loadingSpinner} />
            <p style={{ marginTop: '16px', color: 'var(--color-text-secondary)' }}>
              Analyzing your PR...
            </p>
          </div>
        )}

        {results.map((result) => (
          <div key={result.capability} className={styles.resultCard}>
            <div className={styles.resultHeader}>
              <span className={styles.resultIcon}>
                {CAPABILITIES.find((c) => c.name === result.capability)?.icon}
              </span>
              <h3 className={styles.resultTitle}>{result.capability}</h3>
              {result.isLoading && (
                <span className={styles.resultStatus}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', animation: 'pulse 2s ease-in-out infinite' }} />
                  Analyzing...
                </span>
              )}
            </div>
            {result.content && (
              <div className={styles.resultContent}>
                {result.content.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
