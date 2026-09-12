'use client';

/**
 * IncidentCard — Premium glassmorphism incident summary card
 */

import Link from 'next/link';
import type { Incident } from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfidenceGauge from '@/components/ui/ConfidenceGauge';

interface IncidentCardProps {
  incident: Incident;
  delay?: number;
}

export default function IncidentCard({ incident, delay = 0 }: IncidentCardProps) {
  const eventCount = incident.correlated_event_ids.length;
  const evidenceCount = incident.evidence_list.length;
  const commandCount = incident.troubleshooting_suggestions.length;

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Link href={`/incidents/${incident.id}`}>
      <div
        className="glass-card p-5 cursor-pointer group opacity-0 animate-fade-in-up"
        style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col gap-2">
            <StatusBadge status={incident.status} size="sm" />
            <span className="text-[10px] text-kl-gray-400">{formatTime(incident.created_at)}</span>
          </div>
          <ConfidenceGauge value={incident.confidence} size={52} strokeWidth={4} />
        </div>

        {/* Root cause summary */}
        <p className="text-sm text-kl-black font-medium leading-snug mb-3 line-clamp-3 group-hover:text-kl-orange transition-colors">
          {incident.root_cause_summary || 'Analyzing root cause...'}
        </p>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-kl-gray-100 px-2 py-0.5 text-[10px] font-medium text-kl-gray-600">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {eventCount} events
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-kl-gray-100 px-2 py-0.5 text-[10px] font-medium text-kl-gray-600">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
            {evidenceCount} evidence
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-orange-glow px-2 py-0.5 text-[10px] font-medium text-kl-orange">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {commandCount} commands
          </span>
        </div>
      </div>
    </Link>
  );
}
