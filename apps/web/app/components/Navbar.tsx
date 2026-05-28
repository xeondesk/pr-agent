'use client';

import { useState } from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';

export function Navbar() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <nav className="h-16 border-b border-border bg-surface sticky top-0 z-40 flex items-center justify-between px-6">
      <div className="flex items-center gap-4 w-full max-w-4xl">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search repositories, PRs, issues..."
            className="input w-full pl-10"
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        </div>

        <div className="hidden xl:flex items-center gap-2">
          <div className="rounded-2xl bg-surface-secondary border border-border px-4 py-2 text-xs text-text-secondary">
            AI Insights Live
          </div>
          <div className="rounded-2xl bg-accent-primary/10 text-accent-primary px-4 py-2 text-xs font-medium">
            12 open reviews
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <button className="relative p-3 rounded-2xl hover:bg-surface-secondary transition-all duration-200">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-primary rounded-full border border-surface" />
        </button>

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface-secondary px-3 py-2 hover:bg-surface transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-sm font-semibold text-white">
              U
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium">User</p>
              <p className="text-[11px] text-text-secondary">Product Owner</p>
            </div>
            <ChevronDown size={16} className="text-text-secondary" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-2xl shadow-xl py-2 z-50">
              <a href="#" className="block px-4 py-2 text-sm hover:bg-surface-secondary transition-all duration-200">
                Profile
              </a>
              <a href="#" className="block px-4 py-2 text-sm hover:bg-surface-secondary transition-all duration-200">
                Settings
              </a>
              <a href="#" className="block px-4 py-2 text-sm hover:bg-surface-secondary transition-all duration-200">
                Help & Support
              </a>
              <div className="my-1 border-t border-border" />
              <a href="#" className="block px-4 py-2 text-sm text-accent-primary hover:bg-surface-secondary transition-all duration-200">
                Sign Out
              </a>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
