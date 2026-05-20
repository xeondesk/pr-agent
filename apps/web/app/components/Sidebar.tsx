'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Repositories', href: '/repositories', icon: '📦' },
  { label: 'Pull Requests', href: '/pull-requests', icon: '🔀' },
  { label: 'AI Reviews', href: '/ai-reviews', icon: '🤖' },
  { label: 'Security', href: '/security', icon: '🔒' },
  { label: 'Analytics', href: '/analytics', icon: '📈' },
  { label: 'Reports', href: '/reports', icon: '📋' },
];

const SECONDARY_ITEMS = [
  { label: 'Team', href: '/team', icon: '👥' },
  { label: 'Integrations', href: '/integrations', icon: '🔗' },
  { label: 'Learnings', href: '/learnings', icon: '📚' },
];

const SETTINGS_ITEMS = [
  { label: 'Billing', href: '/billing', icon: '💳' },
  { label: 'Organization', href: '/org-settings', icon: '⚙️' },
  { label: 'Account', href: '/account', icon: '👤' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 md:hidden z-50 p-2 bg-surface border border-border rounded-lg"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen transition-smooth ${
          collapsed ? 'w-20' : 'w-64'
        } md:relative ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="h-full overflow-y-auto border-r border-border bg-surface flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center font-bold text-white">
                  AI
                </div>
                <span className="font-semibold">CodeReview</span>
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 hover:bg-surface-secondary rounded transition-smooth"
            >
              <ChevronDown size={18} className={collapsed ? 'rotate-90' : '-rotate-90'} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-smooth group"
                title={collapsed ? item.label : undefined}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            ))}

            <div className="my-4 border-t border-border" />

            {SECONDARY_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-smooth"
                title={collapsed ? item.label : undefined}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            ))}
          </nav>

          {/* Settings */}
          <div className="border-t border-border px-3 py-4 space-y-1">
            {SETTINGS_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-smooth"
                title={collapsed ? item.label : undefined}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
