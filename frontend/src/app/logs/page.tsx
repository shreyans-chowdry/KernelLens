'use client';

/**
 * KernelLens AI — Log Viewer Page
 * Live scrolling log table with source badges, anomaly indicators, search/filter
 */

import { useEffect, useState } from 'react';
import LogTable from '@/components/logs/LogTable';
import { SkeletonTable } from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { fetchLogs, fetchLogStats } from '@/lib/api';
import type { LogEvent, LogStats } from '@/lib/types';

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, s] = await Promise.all([
        fetchLogs({ limit: 200 }),
        fetchLogStats(),
      ]);
      setLogs(l);
      setStats(s);
    } catch {
      setError('Failed to load log events');
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between opacity-0 animate-fade-in-up" style={{ animationFillMode: 'forwards' }}>
        <div>
          <h1 className="text-2xl font-bold text-kl-black">Log Viewer</h1>
          <p className="mt-1 text-sm text-kl-gray-600">
            Ingested kernel and system log events
          </p>
        </div>
        {stats && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold text-kl-black tabular-nums">{stats.total_logs}</p>
              <p className="text-xs text-kl-gray-400">Total Events</p>
            </div>
            <div className="h-10 w-px bg-kl-gray-200" />
            <div className="text-right">
              <p className="text-2xl font-bold text-kl-orange tabular-nums">{stats.anomaly_count}</p>
              <p className="text-xs text-kl-gray-400">Anomalies</p>
            </div>
          </div>
        )}
      </div>

      {/* Log Table */}
      {loading ? <SkeletonTable rows={10} /> : <LogTable logs={logs} />}
    </div>
  );
}
