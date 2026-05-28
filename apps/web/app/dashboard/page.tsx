'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Code2, AlertCircle, Users, GitBranch, ShieldCheck, Sparkles } from 'lucide-react';
import { ProtectedRoute } from '@/app/components/ProtectedRoute';

const KEY_METRICS = [
  {
    title: 'PRs Reviewed',
    value: '156',
    icon: GitBranch,
    change: '+42% this week',
    positive: true,
  },
  {
    title: 'Security Findings',
    value: '8',
    icon: ShieldCheck,
    change: '-18% lower than last week',
    positive: true,
  },
  {
    title: 'Repositories',
    value: '24',
    icon: Code2,
    change: '+2 added',
    positive: true,
  },
  {
    title: 'Active Developers',
    value: '12',
    icon: Users,
    change: '+3 onboarded',
    positive: true,
  },
];

const CHART_DATA = [
  { date: 'Mon', reviews: 12, issues: 4 },
  { date: 'Tue', reviews: 19, issues: 2 },
  { date: 'Wed', reviews: 15, issues: 3 },
  { date: 'Thu', reviews: 28, issues: 5 },
  { date: 'Fri', reviews: 24, issues: 1 },
  { date: 'Sat', reviews: 18, issues: 2 },
  { date: 'Sun', reviews: 31, issues: 0 },
];

const INSIGHTS = [
  'Performance regression risk identified in auth middleware.',
  'Suggested code quality improvements for database layer.',
  'Security lint alerts reduced by 18% this week.',
];

function StatCard({ title, value, icon: Icon, change }: any) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-secondary uppercase tracking-[0.18em] font-semibold">{title}</p>
          <p className="mt-3 text-3xl font-semibold">{value}</p>
        </div>
        <div className="w-12 h-12 rounded-3xl bg-accent-primary/10 text-accent-primary grid place-items-center">
          <Icon size={24} />
        </div>
      </div>
      <p className="mt-5 text-sm text-text-secondary">{change}</p>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-text-secondary">Last 7 days</span>
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <div className="p-8 space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="card p-8 space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent-primary">AI Insight Summary</p>
              <h1 className="mt-3 text-4xl font-bold">Proactive review intelligence for every PR.</h1>
              <p className="mt-4 max-w-2xl text-text-secondary">
                Keep your team aligned with actionable findings, risk analysis, and trend-based recommendations across security,
                performance, and architecture.
              </p>
            </div>
            <div className="rounded-3xl border border-accent-primary/20 bg-accent-primary/5 px-5 py-4 text-sm text-accent-primary">
              <p className="font-semibold">Risk Score</p>
              <p className="mt-2 text-3xl font-semibold">Low</p>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {KEY_METRICS.map((metric) => (
              <StatCard key={metric.title} {...metric} />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {INSIGHTS.map((insight) => (
              <div key={insight} className="rounded-3xl border border-border bg-surface-secondary p-5">
                <p className="text-sm text-text-secondary">Insight</p>
                <p className="mt-3 text-base font-medium leading-7">{insight}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-sm text-text-secondary uppercase tracking-[0.3em]">Risk Analysis</p>
                <h2 className="mt-2 text-2xl font-semibold">Security · Performance · Complexity</h2>
              </div>
              <Sparkles size={28} className="text-accent-primary" />
            </div>
            <div className="space-y-4">
              {[
                { label: 'Security', value: 'Low', tone: 'text-green-300', note: 'No critical findings this week.' },
                { label: 'Performance', value: 'Moderate', tone: 'text-amber-300', note: '2 hotspots identified in middleware.' },
                { label: 'Complexity', value: 'Stable', tone: 'text-blue-300', note: 'Refactor suggestions pending.' },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-border bg-surface-secondary p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-text-secondary uppercase tracking-[0.2em]">{item.label}</p>
                    <span className={`text-sm font-semibold ${item.tone}`}>{item.value}</span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-text-secondary uppercase tracking-[0.3em]">Active Workload</p>
                <h2 className="mt-2 text-2xl font-semibold">Open review queue</h2>
              </div>
              <div className="rounded-3xl bg-accent-primary/10 px-4 py-2 text-sm text-accent-primary">12 tasks</div>
            </div>
            <div className="space-y-3">
              {[
                { title: 'Fix session timeout bug', label: 'api-core', status: 'Review' },
                { title: 'Refactor auth middleware', label: 'dashboard', status: 'Action needed' },
                { title: 'Update deployment docs', label: 'docs', status: 'Awaiting AI' },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-border bg-surface-secondary p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-text-secondary mt-1">{item.label}</p>
                    </div>
                    <span className="rounded-full bg-surface border border-border px-3 py-1 text-xs text-text-secondary">
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card p-6 xl:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold">Review Activity</h3>
              <p className="text-sm text-text-secondary">AI-driven review volume and issue trend</p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-text-secondary">Last 7 days</span>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={CHART_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
                <XAxis dataKey="date" stroke="#717175" />
                <YAxis stroke="#717175" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                  labelStyle={{ color: '#f5f5f5' }}
                />
                <Line type="monotone" dataKey="reviews" stroke="#0070f3" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="issues" stroke="#f97316" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-5">Recent PR Highlights</h3>
          <div className="space-y-4">
            {[
              {
                title: 'Auth middleware latency drop',
                description: 'High confidence improvement and security check completed.',
                status: 'High confidence',
              },
              {
                title: 'Dependency upgrade alert',
                description: 'Potential SSRF risk found in axios. Recommend patching to v1.6.0.',
                status: 'Security',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-border bg-surface-secondary p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">{item.title}</p>
                  <span className="text-xs uppercase tracking-[0.24em] text-text-secondary">{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </ProtectedRoute>
  );
}
