'use client';

/**
 * KernelLens AI — Incident Detail Page
 * Root cause, confidence gauge, evidence log lines, copy-only command cards
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfidenceGauge from '@/components/ui/ConfidenceGauge';
import CommandCard from '@/components/ui/CommandCard';
import EvidencePanel from '@/components/incidents/EvidencePanel';
import { Spinner } from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { fetchIncidentDetail } from '@/lib/api';
import type { Incident } from '@/lib/types';

export default function IncidentDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncidentDetail(id);
      setIncident(data);
    } catch {
      setError('Failed to load incident details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  if (loading) return <Spinner size="lg" />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;
  if (!incident) return <ErrorState message="Incident not found" />;

  const formatDate = (ts: string) => {
    return new Date(ts).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm opacity-0 animate-fade-in" style={{ animationFillMode: 'forwards' }}>
        <Link href="/incidents" className="text-kl-gray-400 hover:text-kl-orange transition-colors">
          Incidents
        </Link>
        <svg className="h-3.5 w-3.5 text-kl-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="font-medium text-kl-black truncate max-w-xs">
          {incident.root_cause_summary?.slice(0, 40)}...
        </span>
      </div>

      {/* Incident Header */}
      <div className="glass-card p-6 opacity-0 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: Status + Root Cause */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={incident.status} />
              <span className="text-xs text-kl-gray-400">
                {formatDate(incident.created_at)}
              </span>
            </div>

            <h1 className="text-xl font-bold text-kl-black leading-relaxed">
              Root Cause Analysis
            </h1>
            <p className="text-sm text-kl-gray-600 leading-relaxed">
              {incident.root_cause_summary || 'Root cause analysis pending...'}
            </p>

            {/* Event count */}
            <div className="flex items-center gap-4 text-xs text-kl-gray-400">
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {incident.correlated_event_ids.length} correlated events
              </span>
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                {incident.evidence_list.length} evidence items
              </span>
            </div>
          </div>

          {/* Right: Confidence Gauge */}
          <div className="flex flex-col items-center gap-2">
            <ConfidenceGauge value={incident.confidence} size={100} strokeWidth={8} />
            <span className="text-xs font-medium text-kl-gray-400">Confidence</span>
          </div>
        </div>
      </div>

      {/* Evidence Section */}
      <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
        <h2 className="text-lg font-semibold text-kl-black mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-kl-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          Evidence Chain
        </h2>
        <EvidencePanel evidence={incident.evidence_list} />
      </div>

      {/* Troubleshooting Commands */}
      <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
        <h2 className="text-lg font-semibold text-kl-black mb-1 flex items-center gap-2">
          <svg className="h-5 w-5 text-kl-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Troubleshooting Commands
        </h2>
        <p className="text-xs text-kl-gray-400 mb-4">
          Safe, read-only diagnostic commands. Click &quot;Copy&quot; to copy to clipboard — these commands are never executed automatically.
        </p>

        <div className="space-y-3">
          {incident.troubleshooting_suggestions.length === 0 ? (
            <div className="rounded-xl border border-kl-gray-200 bg-kl-white p-6 text-center">
              <p className="text-sm text-kl-gray-400">No troubleshooting commands available</p>
            </div>
          ) : (
            incident.troubleshooting_suggestions.map((cmd, i) => (
              <div
                key={cmd.id}
                className="opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${400 + i * 100}ms`, animationFillMode: 'forwards' }}
              >
                <CommandCard command={cmd.command_text} rationale={cmd.rationale} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
