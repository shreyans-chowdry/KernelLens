'use client';

/**
 * EvidencePanel — Timeline-style evidence list with log lines and AI explanations
 */

import type { Evidence } from '@/lib/types';

interface EvidencePanelProps {
  evidence: Evidence[];
}

export default function EvidencePanel({ evidence }: EvidencePanelProps) {
  if (!evidence.length) {
    return (
      <div className="rounded-xl border border-kl-gray-200 bg-kl-white p-6 text-center">
        <p className="text-sm text-kl-gray-400">No evidence items available</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {evidence.map((item, i) => (
        <div
          key={item.id}
          className="relative flex gap-4 opacity-0 animate-fade-in-up"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'forwards' }}
        >
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            {/* Dot */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-kl-orange bg-kl-white text-xs font-bold text-kl-orange">
              {i + 1}
            </div>
            {/* Line */}
            {i < evidence.length - 1 && (
              <div className="w-0.5 flex-1 bg-gradient-to-b from-kl-orange/40 to-kl-gray-200" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-6">
            <div className="rounded-xl border border-kl-gray-200 bg-kl-white p-4 transition-all hover:border-kl-orange/30 hover:shadow-sm">
              {/* Event ID */}
              {item.log_event_id && (
                <span className="inline-flex items-center gap-1 rounded bg-kl-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-kl-gray-400 mb-2">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07l-1.757 1.757a4.5 4.5 0 00-6.364 6.364l4.5 4.5a4.5 4.5 0 007.244 1.242" />
                  </svg>
                  {item.log_event_id}
                </span>
              )}

              {/* Explanation */}
              <p className="text-sm text-kl-black leading-relaxed">
                {item.explanation_snippet}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
