'use client';

import { useState } from 'react';
import styles from './PRInput.module.css';

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
    <div className={styles.container}>
      <div className={styles.inputGroup}>
        <label className={styles.label}>GitHub PR URL</label>
        <div className={styles.inputWrapper}>
          <span className={styles.icon}>🔗</span>
          <input
            type="text"
            placeholder="https://github.com/owner/repo/pull/123"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            onFocus={() => setIsExpanded(true)}
            className={styles.input}
          />
        </div>
      </div>

      {isExpanded && (
        <div className={`${styles.expandedSection} fade-in`}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Or paste diff (optional)</label>
            <textarea
              placeholder="Paste your git diff or code changes here..."
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
              className={styles.textarea}
            />
          </div>

          <div className={styles.actions}>
            <button onClick={handleSubmit} className="btn-primary">
              <span>⚡</span> Analyze PR
            </button>
            <button
              onClick={() => {
                setIsExpanded(false);
                setPrUrl('');
                setDiff('');
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
