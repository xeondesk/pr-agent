'use client';

import { useState } from 'react';
import { Search, MessageCircle, CheckCircle, AlertCircle, Eye } from 'lucide-react';

const PULL_REQUESTS = [
  {
    id: 1,
    title: 'Add real-time PR updates',
    repo: 'pr-agent',
    author: 'Alice Chen',
    status: 'review',
    reviewer: 'AI Agent',
    confidence: 0.95,
    issues: 3,
    comments: 5,
    created: '2 hours ago',
  },
  {
    id: 2,
    title: 'Fix authentication bug',
    repo: 'api-core',
    author: 'Bob Smith',
    status: 'approved',
    reviewer: 'AI Agent',
    confidence: 0.98,
    issues: 1,
    comments: 2,
    created: '4 hours ago',
  },
  {
    id: 3,
    title: 'Optimize database queries',
    repo: 'api-core',
    author: 'Carol Davis',
    status: 'pending',
    reviewer: 'AI Agent',
    confidence: 0.92,
    issues: 5,
    comments: 0,
    created: '1 hour ago',
  },
];

export default function PullRequestsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Pull Requests</h1>
        <p className="text-text-secondary mt-2">AI-reviewed pull requests from your repositories</p>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search pull requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full pl-10"
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        </div>
        <div className="flex gap-2">
          {['all', 'review', 'approved', 'pending'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg transition-smooth capitalize ${
                filter === f
                  ? 'bg-accent-primary text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* PR List */}
      <div className="space-y-4">
        {PULL_REQUESTS.map((pr) => (
          <div key={pr.id} className="card p-6 hover:border-accent-primary transition-smooth cursor-pointer">
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold truncate">{pr.title}</h3>
                  <p className="text-sm text-text-secondary mt-1">
                    {pr.repo} • {pr.author} • {pr.created}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                    pr.status === 'approved'
                      ? 'bg-green-500/10 text-green-400'
                      : pr.status === 'review'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  {pr.status === 'approved' && <CheckCircle size={14} className="inline mr-1" />}
                  {pr.status === 'review' && <Eye size={14} className="inline mr-1" />}
                  {pr.status === 'pending' && <AlertCircle size={14} className="inline mr-1" />}
                  {pr.status}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                <div className="bg-surface-secondary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary">Confidence</p>
                  <p className="text-lg font-semibold mt-1">{Math.round(pr.confidence * 100)}%</p>
                </div>
                <div className="bg-surface-secondary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary">Issues</p>
                  <p className="text-lg font-semibold mt-1 text-red-400">{pr.issues}</p>
                </div>
                <div className="bg-surface-secondary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary">Comments</p>
                  <p className="text-lg font-semibold mt-1 flex items-center gap-1">
                    <MessageCircle size={16} />
                    {pr.comments}
                  </p>
                </div>
                <div className="hidden md:block bg-surface-secondary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary">Reviewer</p>
                  <p className="text-sm font-medium mt-1">{pr.reviewer}</p>
                </div>
                <button className="btn-secondary text-sm">
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
