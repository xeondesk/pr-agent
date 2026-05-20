'use client';

import { useState } from 'react';
import styles from './Navigation.module.css';

export function Navigation() {
  const [expanded, setExpanded] = useState(true);

  const navItems = [
    { id: 'analyze', label: 'Analyze', icon: '⚡' },
    { id: 'history', label: 'History', icon: '📝' },
    { id: 'webhooks', label: 'Webhooks', icon: '🔗' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'docs', label: 'Docs', icon: '📚' },
  ];

  return (
    <nav className={`${styles.nav} ${!expanded ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.icon}>🤖</span>
          {expanded && <span className={styles.title}>PR-Agent</span>}
        </div>
        <button
          className={styles.toggle}
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '←' : '→'}
        </button>
      </div>

      <div className={styles.menu}>
        {navItems.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={styles.item}
            title={item.label}
          >
            <span className={styles.itemIcon}>{item.icon}</span>
            {expanded && <span className={styles.itemLabel}>{item.label}</span>}
          </a>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.user}>
          <div className={styles.avatar}>U</div>
          {expanded && <span className={styles.username}>User</span>}
        </div>
      </div>
    </nav>
  );
}
