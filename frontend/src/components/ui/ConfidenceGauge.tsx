'use client';

/**
 * ConfidenceGauge — Animated arc chart showing confidence 0–100%
 * Color transitions: red (< 30%) → orange (30–70%) → green (> 70%)
 */

import { useEffect, useState } from 'react';

interface ConfidenceGaugeProps {
  value: number; // 0.0 to 1.0
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export default function ConfidenceGauge({
  value,
  size = 80,
  strokeWidth = 6,
  showLabel = true,
}: ConfidenceGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - animatedValue * circumference;
  const percentage = Math.round(animatedValue * 100);

  const getColor = (v: number) => {
    if (v < 0.3) return '#E74C3C';
    if (v < 0.7) return '#D4783A';
    return '#4CAF50';
  };

  const color = getColor(animatedValue);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--cream-dark)"
          strokeWidth={strokeWidth}
        />
        {/* Animated arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease',
          }}
        />
      </svg>
      {showLabel && (
        <span
          className="absolute text-sm font-semibold"
          style={{ color }}
        >
          {percentage}%
        </span>
      )}
    </div>
  );
}
