'use client';

import { useState } from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';

export function Navbar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <nav className="h-16 border-b border-border bg-surface sticky top-0 z-40 flex items-center justify-between px-6">
      {/* Left side - Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <input
            type="text"
            placeholder="Search repositories, PRs, issues..."
            className="input w-full pl-10"
            onClick={() => setSearchOpen(true)}
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Organization Switcher */}
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-smooth">
          <span className="text-sm">Organization</span>
          <ChevronDown size={16} />
        </button>

        {/* Notifications */}
        <button className="relative p-2 hover:bg-surface-secondary rounded-lg transition-smooth">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-accent-primary rounded-full" />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-2 py-1 hover:bg-surface-secondary rounded-lg transition-smooth"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white text-sm font-medium">
              U
            </div>
            <ChevronDown size={16} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg py-2 z-50">
              <a href="#" className="block px-4 py-2 hover:bg-surface-secondary transition-smooth text-sm">
                Profile
              </a>
              <a href="#" className="block px-4 py-2 hover:bg-surface-secondary transition-smooth text-sm">
                Settings
              </a>
              <a href="#" className="block px-4 py-2 hover:bg-surface-secondary transition-smooth text-sm">
                Help & Support
              </a>
              <div className="my-1 border-t border-border" />
              <a href="#" className="block px-4 py-2 hover:bg-surface-secondary transition-smooth text-sm text-accent-primary">
                Sign Out
              </a>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
