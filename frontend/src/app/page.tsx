'use client';

/**
 * KernelLens AI — Dashboard Home Page
 * Pipeline stats, incident summary, recent logs, and pipeline visualization
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatsCard from '@/components/dashboard/StatsCard';
import PipelineFlow from '@/components/dashboard/PipelineFlow';
import IncidentCard from '@/components/incidents/IncidentCard';
import { SkeletonCard, SkeletonIncidentCard } from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { fetchPipelineStats, fetchIncidents, fetchLogs } from '@/lib/api';
import type { PipelineStats, Incident, LogEvent } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [recentLogs, setRecentLogs] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, i, l] = await Promise.all([
        fetchPipelineStats(),
        fetchIncidents({ limit: 4 }),
        fetchLogs({ limit: 6 }),
      ]);
      setStats(s);
      setIncidents(i);
      setRecentLogs(l);
    } catch (e) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="opacity-0 animate-fade-in-up" style={{ animationFillMode: 'forwards' }}>
        <h1 className="text-2xl font-bold text-kl-black">Dashboard</h1>
        <p className="mt-1 text-sm text-kl-gray-600">
          Real-time kernel log diagnostics and automated root cause analysis
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : stats ? (
          <>
            <StatsCard
              title="Total Logs"
              value={stats.total_logs}
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
              trend="Ingested via pipeline"
              color="var(--charcoal)"
              delay={100}
            />
            <StatsCard
              title="Anomalies Detected"
              value={stats.anomaly_count}
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              }
              trend="ML classifier flagged"
              color="var(--orange)"
              delay={200}
            />
            <StatsCard
              title="Active Incidents"
              value={stats.active_incidents}
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                </svg>
              }
              trend="Requires attention"
              color="var(--error)"
              delay={300}
            />
            <StatsCard
              title="Context Reduction"
              value={stats.reduction_ratio_pct}
              suffix="%"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              }
              trend="Log volume reduced for LLM"
              color="var(--success)"
              delay={400}
            />
          </>
        ) : null}
      </div>

      {/* Pipeline Flow */}
      {stats && (
        <PipelineFlow
          totalLogs={stats.total_logs}
          anomalyCount={stats.anomaly_count}
          incidentCount={stats.incident_count}
        />
      )}

      {/* Recent Incidents */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-kl-black">Recent Incidents</h2>
          <Link
            href="/incidents"
            className="text-sm font-medium text-kl-orange hover:text-orange-dark transition-colors"
          >
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonIncidentCard key={i} />)
            : incidents.map((inc, i) => (
                <IncidentCard key={inc.id} incident={inc} delay={i * 100} />
              ))}
        </div>
      </div>

      {/* Recent Logs Preview */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-kl-black">Recent Log Events</h2>
          <Link
            href="/logs"
            className="text-sm font-medium text-kl-orange hover:text-orange-dark transition-colors"
          >
            View all →
          </Link>
        </div>
        <div className="glass-card overflow-hidden divide-y divide-kl-gray-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-kl-gray-400 animate-pulse">Loading events...</div>
          ) : recentLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-kl-gray-400">No recent events</div>
          ) : (
            recentLogs.map((log, i) => {
              const level = (log.parsed_fields as Record<string, string>)?.log_level;
              const isAnomaly = level && ['crit', 'error', 'emerg', 'alert'].includes(level);
              return (
                <div
                  key={log.id}
                  className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-cream/40 opacity-0 animate-fade-in-up ${
                    isAnomaly ? 'border-l-2 border-kl-error' : 'border-l-2 border-transparent'
                  }`}
                  style={{ animationDelay: `${600 + i * 80}ms`, animationFillMode: 'forwards' }}
                >
                  <span className="shrink-0 text-xs text-kl-gray-400 w-16 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{
                      background: log.source === 'synthetic' ? 'var(--orange-glow)' : 'var(--gray-100)',
                      color: log.source === 'synthetic' ? 'var(--orange)' : 'var(--gray-600)',
                    }}
                  >
                    {log.source}
                  </span>
                  <span className="truncate font-mono text-xs text-kl-black">{log.raw_text}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
