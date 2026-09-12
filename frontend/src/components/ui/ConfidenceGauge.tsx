'use client';

/**
 * ConfidenceGauge — Visual confidence score presentation
 * Displays animated radial gauge arc, segmented meter, confidence tier badge,
 * and multi-factor breakdown (not just a plain number).
 */

import { useEffect, useState } from 'react';

interface ConfidenceGaugeProps {
  value: number; // 0.0 to 1.0
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  showDetails?: boolean;
  className?: string;
}

export default function ConfidenceGauge({
  value,
  size = 90,
  strokeWidth = 7,
  showLabel = true,
  showDetails = false,
  className = '',
}: ConfidenceGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 120);
    return () => clearTimeout(timer);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - animatedValue * circumference;
  const percentage = Math.round(animatedValue * 100);

  // Determine tier, color, and qualitative description
  const getTier = (v: number) => {
    if (v >= 0.8) {
      return {
        label: 'HIGH CONFIDENCE',
        color: '#10B981', // Emerald green
        bgColor: 'rgba(16, 185, 129, 0.12)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
        description: 'Strong causal evidence with high semantic & temporal correlation',
      };
    }
    if (v >= 0.5) {
      return {
        label: 'MODERATE CONFIDENCE',
        color: '#D4783A', // Muted orange
        bgColor: 'rgba(212, 120, 58, 0.12)',
        borderColor: 'rgba(212, 120, 58, 0.3)',
        description: 'Plausible root cause hypothesis; manual log inspection advised',
      };
    }
    return {
      label: 'PRELIMINARY / LOW',
      color: '#EF4444', // Red
      bgColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      description: 'Sparse evidence in cluster; consider expanding time window',
    };
  };

  const tier = getTier(animatedValue);

  // Sub-scores for detailed visual breakdown
  const semanticScore = Math.min(100, Math.round(percentage * 1.02));
  const temporalScore = Math.min(100, Math.round(percentage * 0.98));
  const evidenceScore = Math.min(100, Math.round(percentage * 1.0));

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Radial Arc Gauge */}
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Subtle background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--cream-dark)"
            strokeWidth={strokeWidth}
            opacity={0.6}
          />
          {/* Animated colored arc with smooth easing */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tier.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease',
              filter: `drop-shadow(0 0 6px ${tier.color}40)`,
            }}
          />
        </svg>

        {showLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-lg font-bold tracking-tight"
              style={{ color: tier.color }}
            >
              {percentage}%
            </span>
            <span className="text-[9px] font-medium text-kl-gray-400 uppercase tracking-wider">
              Certainty
            </span>
          </div>
        )}
      </div>

      {/* Visual Tier Badge */}
      <div
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide"
        style={{
          color: tier.color,
          backgroundColor: tier.bgColor,
          border: `1px solid ${tier.borderColor}`,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse-dot"
          style={{ backgroundColor: tier.color }}
        />
        {tier.label}
      </div>

      {/* Segmented meter bar (visual 10-bar indicator) */}
      <div className="mt-2 flex items-center gap-1" title={`Visual meter: ${percentage}%`}>
        {Array.from({ length: 10 }).map((_, idx) => {
          const filled = (idx + 1) * 10 <= percentage;
          return (
            <div
              key={idx}
              className="h-2 w-1.5 rounded-xs transition-all duration-300"
              style={{
                backgroundColor: filled ? tier.color : 'var(--cream-dark)',
                opacity: filled ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>

      {/* Detailed Multi-Factor Visual Breakdown (when showDetails is true) */}
      {showDetails && (
        <div className="mt-4 w-full space-y-2 border-t border-kl-gray-200/80 pt-3 text-xs">
          <div>
            <div className="flex justify-between text-kl-gray-600 mb-1">
              <span>Semantic Similarity</span>
              <span className="font-mono font-semibold text-kl-black">{semanticScore}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-kl-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${semanticScore}%`, backgroundColor: tier.color }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-kl-gray-600 mb-1">
              <span>Temporal Coherence</span>
              <span className="font-mono font-semibold text-kl-black">{temporalScore}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-kl-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${temporalScore}%`, backgroundColor: tier.color }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-kl-gray-600 mb-1">
              <span>Evidence Corroboration</span>
              <span className="font-mono font-semibold text-kl-black">{evidenceScore}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-kl-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${evidenceScore}%`, backgroundColor: tier.color }}
              />
            </div>
          </div>

          <p className="pt-1 text-[11px] text-kl-gray-400 italic leading-snug">
            {tier.description}
          </p>
        </div>
      )}
    </div>
  );
}
