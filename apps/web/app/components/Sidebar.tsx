'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Repositories', href: '/repositories', icon: '📦' },
  { label: 'Pull Requests', href: '/pull-requests', icon: '🔀' },
  { label: 'AI Reviews', href: '/ai-reviews', icon: '🤖' },
  { label: 'Security', href: '/security', icon: '🔒' },
  { label: 'Analytics', href: '/analytics', icon: '📈' },
];

const SECONDARY_ITEMS = [
  { label: 'Team', href: '/team', icon: '👥' },
  { label: 'Integrations', href: '/integrations', icon: '🔗' },
];

const SETTINGS_ITEMS = [
  { label: 'Account', href: '/account', icon: '👤' },
  { label: 'Billing', href: '/billing', icon: '💳' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 md:hidden z-50 p-2 bg-surface border border-border rounded-xl shadow-lg"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={`fixed left-0 top-0 h-screen transition-all duration-300 ease-out ${
          collapsed ? 'w-20' : 'w-72'
        } md:relative ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="h-full overflow-y-auto border-r border-border bg-surface/95 backdrop-blur-xl flex flex-col">
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            {!collapsed ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-sm font-black text-white shadow-lg shadow-accent-primary/20">
                  AI
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Stitch</p>
                  <p className="text-base font-semibold">CodeReview</p>
                </div>
              </div>
            ) : (
              <div className="w-full flex items-center justify-center">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-sm font-black text-white shadow-lg shadow-accent-primary/20">
                  AI
                </div>
              </div>
            )}

            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 hover:bg-surface-secondary rounded-xl transition-all duration-200"
              aria-label="Collapse sidebar"
            >
              <ChevronDown size={18} className={collapsed ? 'rotate-90' : '-rotate-90'} />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 ${
                    active
                      ? 'bg-accent-primary/10 text-accent-primary shadow-sm shadow-accent-primary/10'
                      : 'hover:bg-surface-secondary text-text-primary'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="text-xl">{item.icon}</span>
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              );
            })}

            {!collapsed && <div className="mt-4 mb-2 px-3 text-xs uppercase tracking-[0.22em] text-text-secondary">Workspace</div>}
            {SECONDARY_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-surface-secondary transition-all duration-200 text-text-primary"
                title={collapsed ? item.label : undefined}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            ))}
          </nav>

          <div className="border-t border-border px-3 py-4">
            {SETTINGS_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-surface-secondary transition-all duration-200 text-text-primary"
                title={collapsed ? item.label : undefined}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
