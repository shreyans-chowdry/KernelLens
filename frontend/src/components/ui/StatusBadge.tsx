'use client';

/**
 * StatusBadge — Pill badge for incident status
 * Active: pulsing orange dot | Resolved: green checkmark
 */

interface StatusBadgeProps {
  status: 'active' | 'resolved';
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const isActive = status === 'active';
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses} ${
        isActive
          ? 'bg-orange-glow text-kl-orange'
          : 'bg-success-light text-success'
      }`}
    >
      {isActive ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kl-orange opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-kl-orange" />
        </span>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {isActive ? 'Active' : 'Resolved'}
    </span>
  );
}
