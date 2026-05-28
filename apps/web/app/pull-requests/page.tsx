'use client';

import { useState } from 'react';
import { Search, MessageCircle, CheckCircle, AlertCircle, Eye, Clock } from 'lucide-react';

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

const FILTERS = [
  { key: 'all', label: 'All Reviews' },
  { key: 'review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'pending', label: 'Pending' },
];

export default function PullRequestsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pull Requests</h1>
          <p className="text-text-secondary mt-2">AI-reviewed pull requests from your repositories.</p>
        </div>
        <div className="inline-flex items-center gap-3 rounded-3xl border border-border bg-surface-secondary px-4 py-3">
          <Clock size={18} />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-text-secondary">Latest sync</p>
            <p className="text-sm font-medium">3 minutes ago</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search pull requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full pl-12"
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              onClick={() => setFilter(option.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                filter === option.key
                  ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {PULL_REQUESTS.map((pr) => (
          <div key={pr.id} className="card p-6 hover:-translate-y-0.5 hover:border-accent-primary transition-smooth cursor-pointer">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold truncate">{pr.title}</h3>
                <p className="text-sm text-text-secondary mt-2">
                  {pr.repo} · {pr.author} · {pr.created}
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                  pr.status === 'approved'
                    ? 'bg-green-500/10 text-green-300'
                    : pr.status === 'review'
                      ? 'bg-blue-500/10 text-blue-300'
                      : 'bg-amber-500/10 text-amber-300'
                }`}
              >
                {pr.status === 'approved' && <CheckCircle size={14} />}
                {pr.status === 'review' && <Eye size={14} />}
                {pr.status === 'pending' && <AlertCircle size={14} />}
                {pr.status}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-border bg-surface-secondary p-4">
                <p className="text-xs text-text-secondary uppercase tracking-[0.2em]">Confidence</p>
                <p className="mt-3 text-2xl font-semibold">{Math.round(pr.confidence * 100)}%</p>
              </div>
              <div className="rounded-3xl border border-border bg-surface-secondary p-4">
                <p className="text-xs text-text-secondary uppercase tracking-[0.2em]">Issues</p>
                <p className="mt-3 text-2xl font-semibold text-red-400">{pr.issues}</p>
              </div>
              <div className="rounded-3xl border border-border bg-surface-secondary p-4">
                <p className="text-xs text-text-secondary uppercase tracking-[0.2em]">Comments</p>
                <p className="mt-3 text-2xl font-semibold flex items-center gap-2">
                  <MessageCircle size={18} />
                  {pr.comments}
                </p>
              </div>
              <div className="rounded-3xl border border-border bg-surface-secondary p-4">
                <p className="text-xs text-text-secondary uppercase tracking-[0.2em]">Reviewer</p>
                <p className="mt-3 text-sm font-medium">{pr.reviewer}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button className="btn-primary text-sm">Open Review</button>
              <button className="btn-secondary text-sm">More details</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
