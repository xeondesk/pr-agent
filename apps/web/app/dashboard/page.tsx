'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Code2, AlertCircle, Users, GitBranch, Zap } from 'lucide-react';

const SAMPLE_CHART_DATA = [
  { date: 'Mon', value: 12 },
  { date: 'Tue', value: 19 },
  { date: 'Wed', value: 15 },
  { date: 'Thu', value: 28 },
  { date: 'Fri', value: 24 },
  { date: 'Sat', value: 18 },
  { date: 'Sun', value: 31 },
];

const METRICS = [
  {
    title: 'Repositories',
    value: '24',
    icon: Code2,
    change: '+2 this week',
    positive: true,
  },
  {
    title: 'PRs Reviewed',
    value: '156',
    icon: GitBranch,
    change: '+45% vs last week',
    positive: true,
  },
  {
    title: 'Security Issues',
    value: '8',
    icon: AlertCircle,
    change: '-3 since Monday',
    positive: true,
  },
  {
    title: 'Active Developers',
    value: '12',
    icon: Users,
    change: '2 new members',
    positive: true,
  },
];

function MetricCard({ title, value, icon: Icon, change, positive }: any) {
  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-secondary text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <Icon size={24} className="text-accent-primary opacity-60" />
      </div>
      <p className={`text-sm ${positive ? 'text-green-400' : 'text-red-400'}`}>{change}</p>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-6">{title}</h3>
      {children}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-text-secondary mt-2">Welcome back! Here's your team's review activity.</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PR Reviews Trend */}
        <ChartCard title="PR Reviews Trend">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={SAMPLE_CHART_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
              <XAxis dataKey="date" stroke="#717175" />
              <YAxis stroke="#717175" />
              <Tooltip
                contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                labelStyle={{ color: '#f5f5f5' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#0070f3"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Security Issues */}
        <ChartCard title="Security Findings">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={SAMPLE_CHART_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
              <XAxis dataKey="date" stroke="#717175" />
              <YAxis stroke="#717175" />
              <Tooltip
                contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                labelStyle={{ color: '#f5f5f5' }}
              />
              <Bar dataKey="value" fill="#ef4444" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Recent Reviews</h3>
          <a href="/ai-reviews" className="text-accent-primary text-sm hover:underline">
            View all
          </a>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-surface-secondary rounded-lg hover:bg-surface transition-smooth">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full bg-accent-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">feature/new-dashboard</p>
                  <p className="text-xs text-text-tertiary">PR #342 • Reviewed 2 hours ago</p>
                </div>
              </div>
              <span className="text-xs bg-green-500/10 text-green-400 px-2 py-1 rounded flex-shrink-0">
                Approved
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
