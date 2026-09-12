'use client';

/**
 * StatsCard — Glassmorphism card with animated count-up numbers
 */

import { useEffect, useState } from 'react';

interface StatsCardProps {
  title: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  trend?: string;
  color?: string;
  delay?: number;
}

export default function StatsCard({
  title,
  value,
  suffix = '',
  icon,
  trend,
  color = 'var(--orange)',
  delay = 0,
}: StatsCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 1000;
      const steps = 30;
      const increment = value / steps;
      let current = 0;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        current = Math.min(current + increment, value);
        setDisplayValue(Math.round(current * 100) / 100);
        if (step >= steps) {
          setDisplayValue(value);
          clearInterval(interval);
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return (
    <div
      className="glass-card p-6 opacity-0 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-kl-gray-600">{title}</p>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform hover:scale-110"
          style={{ background: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-kl-black tabular-nums">
          {Number.isInteger(value) ? Math.round(displayValue) : displayValue.toFixed(1)}
        </span>
        {suffix && (
          <span className="text-sm font-medium text-kl-gray-400">{suffix}</span>
        )}
      </div>

      {trend && (
        <p className="mt-2 text-xs text-kl-gray-400">{trend}</p>
      )}
    </div>
  );
}
