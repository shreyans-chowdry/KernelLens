'use client';

/**
 * LoadingSpinner — Skeleton loaders and animated spinner
 */

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };

  return (
    <div className="flex items-center justify-center p-8">
      <svg
        className={`animate-spin ${sizeMap[size]} text-kl-orange`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-24 rounded bg-kl-gray-200" />
        <div className="h-6 w-6 rounded bg-kl-gray-200" />
      </div>
      <div className="h-8 w-20 rounded bg-kl-gray-200 mb-2" />
      <div className="h-3 w-32 rounded bg-kl-gray-200" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-kl-gray-200">
        <div className="flex gap-4">
          <div className="h-4 w-20 rounded bg-kl-gray-200" />
          <div className="h-4 w-32 rounded bg-kl-gray-200" />
          <div className="h-4 w-48 rounded bg-kl-gray-200 flex-1" />
          <div className="h-4 w-16 rounded bg-kl-gray-200" />
        </div>
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 border-b border-kl-gray-100 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
          <div className="flex gap-4 items-center">
            <div className="h-4 w-20 rounded bg-kl-gray-200" />
            <div className="h-4 w-32 rounded bg-kl-gray-200" />
            <div className="h-4 rounded bg-kl-gray-200 flex-1" />
            <div className="h-4 w-16 rounded bg-kl-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonIncidentCard() {
  return (
    <div className="glass-card p-6 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 w-16 rounded-full bg-kl-gray-200" />
        <div className="h-12 w-12 rounded-full bg-kl-gray-200" />
      </div>
      <div className="h-4 w-full rounded bg-kl-gray-200 mb-2" />
      <div className="h-4 w-3/4 rounded bg-kl-gray-200 mb-4" />
      <div className="flex gap-2">
        <div className="h-6 w-20 rounded bg-kl-gray-200" />
        <div className="h-6 w-24 rounded bg-kl-gray-200" />
      </div>
    </div>
  );
}
