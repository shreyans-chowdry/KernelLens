'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { checkHealth } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/logs', label: 'Logs' },
  { href: '/incidents', label: 'Incidents' },
];

export default function TopBar() {
  const pathname = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const ping = () => checkHealth().then((ok) => alive && setOnline(ok));
    ping();
    const id = setInterval(ping, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="wordmark" aria-label="KernelLens home">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path d="M1 15h4l2-3 2 3h2l3-12 3 18 2-6h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="14" cy="3" r="2" fill="var(--signal)" />
          </svg>
          <span>KernelLens</span>
        </Link>

        <nav aria-label="Main" className="topnav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="topnav-link"
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="backend-status" role="status" aria-live="polite">
          <span className={`status-dot ${online === null ? 'is-pending' : online ? 'is-on' : 'is-off'}`} aria-hidden="true" />
          <span className="backend-status-text">
            {online === null ? 'Checking backend' : online ? 'Backend connected' : 'Backend offline'}
          </span>
        </div>
      </div>
    </header>
  );
}
