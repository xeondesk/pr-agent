'use client';

import { useState } from 'react';
import { Navigation } from './Navigation';
import { Header } from './Header';
import { PRInput } from './PRInput';
import { CapabilityAnalyzer } from './CapabilityAnalyzer';

export function Dashboard() {
  const [prUrl, setPrUrl] = useState<string>('');
  const [showAnalyzer, setShowAnalyzer] = useState(false);

  return (
    <div className="dashboard">
      <Navigation />
      <div className="main-content">
        <Header />
        <div className="content-wrapper">
          {!showAnalyzer ? (
            <div className="welcome-section">
              <div className="welcome-card">
                <div className="welcome-icon">🚀</div>
                <h2>Analyze Your PR</h2>
                <p>Get instant AI-powered insights on your pull requests</p>
              </div>
              <PRInput
                onSubmit={(url) => {
                  setPrUrl(url);
                  setShowAnalyzer(true);
                }}
              />
            </div>
          ) : (
            <CapabilityAnalyzer prUrl={prUrl} />
          )}
        </div>
      </div>
    </div>
  );
}
