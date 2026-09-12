'use client';

/**
 * KernelLens AI — Incidents List Page
 * Card grid of incidents (newest first) with status filter
 */

import { useEffect, useState } from 'react';
import IncidentCard from '@/components/incidents/IncidentCard';
import { SkeletonIncidentCard } from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { fetchIncidents } from '@/lib/api';
import type { Incident } from '@/lib/types';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncidents({
        status: statusFilter || undefined,
        limit: 50,
      });
      setIncidents(data);
    } catch {
      setError('Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  const activeCount = incidents.filter((i) => i.status === 'active').length;
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between opacity-0 animate-fade-in-up" style={{ animationFillMode: 'forwards' }}>
        <div>
          <h1 className="text-2xl font-bold text-kl-black">Incidents</h1>
          <p className="mt-1 text-sm text-kl-gray-600">
            Correlated kernel fault incidents with root cause analysis
          </p>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-kl-gray-100 p-1">
          <button
            onClick={() => setStatusFilter('')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              !statusFilter
                ? 'bg-kl-white text-kl-black shadow-sm'
                : 'text-kl-gray-600 hover:text-kl-black'
            }`}
          >
            All ({incidents.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              statusFilter === 'active'
                ? 'bg-kl-white text-kl-orange shadow-sm'
                : 'text-kl-gray-600 hover:text-kl-black'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              statusFilter === 'resolved'
                ? 'bg-kl-white text-success shadow-sm'
                : 'text-kl-gray-600 hover:text-kl-black'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>
      </div>

      {/* Incident Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonIncidentCard key={i} />)
          : incidents.length === 0
          ? (
            <div className="col-span-2 py-16 text-center">
              <p className="text-sm text-kl-gray-400">No incidents found</p>
            </div>
          )
          : incidents.map((inc, i) => (
              <IncidentCard key={inc.id} incident={inc} delay={i * 100} />
            ))}
      </div>
    </div>
  );
}
