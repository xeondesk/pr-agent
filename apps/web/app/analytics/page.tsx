'use client';

import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, Download } from 'lucide-react';

const TREND_DATA = [
  { week: 'W1', reviews: 45, bugs: 12, improvements: 23 },
  { week: 'W2', reviews: 52, bugs: 15, improvements: 28 },
  { week: 'W3', reviews: 48, bugs: 8, improvements: 31 },
  { week: 'W4', reviews: 61, bugs: 10, improvements: 35 },
];

const HEALTH_DATA = [
  { repo: 'pr-agent', score: 92 },
  { repo: 'api-core', score: 78 },
  { repo: 'dashboard', score: 85 },
  { repo: 'frontend', score: 72 },
];

const TIME_DATA = [
  { time: '00:00', latency: 2.1 },
  { time: '06:00', latency: 1.8 },
  { time: '12:00', latency: 2.5 },
  { time: '18:00', latency: 3.2 },
  { time: '23:59', latency: 1.9 },
];

function ChartCard({ title, children }: any) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-text-secondary mt-2">Team productivity and code quality metrics</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-surface-secondary transition-smooth">
            <Calendar size={18} />
            <span className="text-sm">Last 30 Days</span>
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Reviews', value: '2,456', change: '+23%' },
          { label: 'Avg Latency', value: '2.5s', change: '-12%' },
          { label: 'Bugs Found', value: '156', change: '+8%' },
          { label: 'Code Quality', value: '8.7/10', change: '+0.5' },
        ].map((metric) => (
          <div key={metric.label} className="card p-4">
            <p className="text-text-secondary text-sm">{metric.label}</p>
            <p className="text-2xl font-bold mt-2">{metric.value}</p>
            <p className="text-xs text-green-400 mt-2">{metric.change} vs last period</p>
          </div>
        ))}
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review Trends */}
        <ChartCard title="Review Activity">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={TREND_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
              <XAxis dataKey="week" stroke="#717175" />
              <YAxis stroke="#717175" />
              <Tooltip
                contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                labelStyle={{ color: '#f5f5f5' }}
              />
              <Area
                type="monotone"
                dataKey="reviews"
                fill="#0070f3"
                stroke="#0070f3"
                opacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Issues Detected */}
        <ChartCard title="Issues & Improvements">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={TREND_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
              <XAxis dataKey="week" stroke="#717175" />
              <YAxis stroke="#717175" />
              <Tooltip
                contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                labelStyle={{ color: '#f5f5f5' }}
              />
              <Legend />
              <Bar dataKey="bugs" fill="#ef4444" radius={[8, 8, 0, 0]} />
              <Bar dataKey="improvements" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Repository Health */}
        <ChartCard title="Repository Health Scores">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={HEALTH_DATA}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
              <XAxis type="number" stroke="#717175" domain={[0, 100]} />
              <YAxis dataKey="repo" type="category" stroke="#717175" width={150} />
              <Tooltip
                contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                labelStyle={{ color: '#f5f5f5' }}
              />
              <Bar dataKey="score" fill="#7c3aed" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Review Latency */}
        <ChartCard title="Review Latency Trend">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={TIME_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2e44" />
              <XAxis dataKey="time" stroke="#717175" />
              <YAxis stroke="#717175" />
              <Tooltip
                contentStyle={{ backgroundColor: '#131625', border: '1px solid #2d2e44' }}
                labelStyle={{ color: '#f5f5f5' }}
              />
              <Line
                type="monotone"
                dataKey="latency"
                stroke="#f59e0b"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Top Issues</h3>
          <div className="space-y-3">
            {[
              { issue: 'SQL injection vulnerability', count: 12, severity: 'high' },
              { issue: 'Unhandled promise rejection', count: 8, severity: 'medium' },
              { issue: 'Missing input validation', count: 15, severity: 'medium' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-surface-secondary rounded">
                <div>
                  <p className="text-sm font-medium">{item.issue}</p>
                  <p className="text-xs text-text-tertiary">Found {item.count} times</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    item.severity === 'high'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Team Performance</h3>
          <div className="space-y-3">
            {[
              { dev: 'Alice Chen', reviews: 234, accuracy: 0.96 },
              { dev: 'Bob Smith', reviews: 198, accuracy: 0.94 },
              { dev: 'Carol Davis', reviews: 156, accuracy: 0.97 },
            ].map((item, i) => (
              <div key={i} className="p-3 bg-surface-secondary rounded">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{item.dev}</p>
                  <span className="text-xs text-accent-primary">{item.reviews} reviews</span>
                </div>
                <div className="w-full bg-surface rounded-full h-2">
                  <div
                    className="h-2 bg-accent-primary rounded-full"
                    style={{ width: `${item.accuracy * 100}%` }}
                  />
                </div>
                <p className="text-xs text-text-tertiary mt-1">{Math.round(item.accuracy * 100)}% accuracy</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
