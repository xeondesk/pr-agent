'use client';

import { useState } from 'react';
import { Search, Plus, GitBranch, GitFork, MoreVertical, Shield, Clock, TrendingUp } from 'lucide-react';

const REPOSITORIES = [
  {
    id: 1,
    name: 'pr-agent',
    provider: 'github',
    visibility: 'public',
    description: 'AI-powered PR analysis platform',
    prs: 12,
    lastScan: '2 hours ago',
    riskScore: 'low',
    reviews: 156,
  },
  {
    id: 2,
    name: 'api-core',
    provider: 'github',
    visibility: 'private',
    description: 'Core API services',
    prs: 5,
    lastScan: '30 minutes ago',
    riskScore: 'medium',
    reviews: 89,
  },
  {
    id: 3,
    name: 'dashboard',
    provider: 'github',
    visibility: 'private',
    description: 'Admin dashboard UI',
    prs: 8,
    lastScan: '1 hour ago',
    riskScore: 'low',
    reviews: 45,
  },
];

export default function RepositoriesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Repositories</h1>
          <p className="text-text-secondary mt-2">Manage and monitor your integrated repositories</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          Add Repository
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input w-full pl-10"
        />
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
      </div>

      {/* Repository Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 font-semibold text-text-secondary text-sm">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-text-secondary text-sm">Description</th>
                <th className="text-left px-6 py-4 font-semibold text-text-secondary text-sm">PRs</th>
                <th className="text-left px-6 py-4 font-semibold text-text-secondary text-sm">Risk</th>
                <th className="text-left px-6 py-4 font-semibold text-text-secondary text-sm">Last Scan</th>
                <th className="text-left px-6 py-4 font-semibold text-text-secondary text-sm">Reviews</th>
                <th className="text-right px-6 py-4 font-semibold text-text-secondary text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {REPOSITORIES.map((repo) => (
                <tr key={repo.id} className="hover:bg-surface-secondary transition-smooth">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {repo.provider === 'github' && <GitBranch size={18} />}
                      <div>
                        <p className="font-medium">{repo.name}</p>
                        <span className="inline-block px-2 py-1 mt-1 text-xs rounded bg-surface-secondary text-text-secondary">
                          {repo.visibility}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{repo.description}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp size={16} className="text-accent-primary" />
                      {repo.prs}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        repo.riskScore === 'low'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      <Shield size={14} />
                      {repo.riskScore}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      <Clock size={16} />
                      {repo.lastScan}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{repo.reviews}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-surface-secondary rounded transition-smooth">
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
