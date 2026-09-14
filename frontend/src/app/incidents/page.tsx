'use client';

/**
 * KernelLens AI — Incident History Page
 * Git-log-style linear commit history (ChronoDB spirit, minus branches).
 * Supports filtering by Status, Severity, Date, and search query.
 * Allows clicking into any past incident to view its full evidence trail and diagnostics.
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import GitLogTimeline, { getIncidentSeverity, detectSubsystem } from '@/components/incidents/GitLogTimeline';
import IncidentCard from '@/components/incidents/IncidentCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonIncidentCard } from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { fetchIncidents, updateIncidentStatus } from '@/lib/api';
import type { Incident } from '@/lib/types';

type ViewMode = 'timeline' | 'compact' | 'grid';
type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type DateRangeFilter = 'all' | '24h' | '7d' | '30d';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncidents({
        limit: 100,
      });
      setIncidents(data);
    } catch {
      setError('Failed to load incident history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleStatus = async (id: string, newStatus: 'active' | 'resolved') => {
    try {
      await updateIncidentStatus(id, newStatus);
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === id ? { ...inc, status: newStatus } : inc))
      );
    } catch {
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === id ? { ...inc, status: newStatus } : inc))
      );
    }
  };

  // Filter incidents in memory based on all criteria
  const filteredIncidents = useMemo(() => {
    const now = Date.now();

    return incidents.filter((incident) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && incident.status !== statusFilter) {
        return false;
      }

      // 2. Severity Filter
      if (severityFilter !== 'all') {
        const sev = getIncidentSeverity(incident);
        if (sev.level !== severityFilter) {
          return false;
        }
      }

      // 3. Date Filter
      if (dateFilter !== 'all') {
        const incidentTime = new Date(incident.created_at).getTime();
        const diffMs = now - incidentTime;
        if (dateFilter === '24h' && diffMs > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '7d' && diffMs > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '30d' && diffMs > 30 * 24 * 60 * 60 * 1000) return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = incident.id.toLowerCase().includes(q);
        const matchesCause = (incident.root_cause_summary || '').toLowerCase().includes(q);
        const matchesSubsys = detectSubsystem(incident.root_cause_summary).includes(q);
        const matchesEvidence = incident.evidence_list.some((ev) =>
          ev.explanation_snippet.toLowerCase().includes(q)
        );
        return matchesId || matchesCause || matchesSubsys || matchesEvidence;
      }

      return true;
    });
  }, [incidents, statusFilter, severityFilter, dateFilter, searchQuery]);

  // Summary counts
  const totalCount = incidents.length;
  const activeCount = incidents.filter((i) => i.status === 'active').length;
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length;
  const criticalCount = incidents.filter((i) => getIncidentSeverity(i).level === 'critical').length;

  const hasActiveFilters =
    statusFilter !== 'all' ||
    severityFilter !== 'all' ||
    dateFilter !== 'all' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setStatusFilter('all');
    setSeverityFilter('all');
    setDateFilter('all');
    setSearchQuery('');
  };

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header & Statistics Cards */}
      <div
        className="glass-card p-6 md:p-8 opacity-0 animate-fade-in-up"
        style={{ animationFillMode: 'forwards' }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-2.5 w-2.5 rounded-full bg-kl-orange animate-pulse-dot" />
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-kl-orange">
                Audit Trail & Diagnostic Log
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-kl-black tracking-tight">
              Incident History
            </h1>
            <p className="mt-1 text-sm text-kl-gray-600 max-w-2xl leading-relaxed">
              Sequential chronological audit history of all correlated Linux kernel failure cascades,
              anomalous event clusters, and AI-derived root cause diagnostic verdicts.
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-kl-gray-200/80 bg-kl-white/80 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-kl-gray-400">Total Incidents</span>
              <p className="mt-0.5 font-mono text-xl font-bold text-kl-black">{totalCount}</p>
            </div>
            <div className="rounded-xl border border-kl-orange/30 bg-orange-500/10 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-kl-orange">Active Faults</span>
              <p className="mt-0.5 font-mono text-xl font-bold text-kl-orange">{activeCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Resolved</span>
              <p className="mt-0.5 font-mono text-xl font-bold text-emerald-800">{resolvedCount}</p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">Critical</span>
              <p className="mt-0.5 font-mono text-xl font-bold text-red-700">{criticalCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Status, Severity, Date, Search, View Switcher) */}
      <div className="glass-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID (inc-001), keywords, or subsystem (storage, oom)..."
              className="w-full rounded-xl border border-kl-gray-200 bg-kl-white px-3.5 py-2 pl-9 text-xs text-kl-black placeholder-kl-gray-400 focus:border-kl-orange focus:outline-hidden focus:ring-1 focus:ring-kl-orange shadow-2xs"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-kl-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2 text-xs text-kl-gray-400 hover:text-kl-black"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Mode Switcher */}
          <div className="inline-flex rounded-xl border border-kl-gray-200 bg-kl-gray-100/80 p-1 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('timeline')}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'timeline'
                  ? 'bg-kl-white text-kl-black shadow-xs'
                  : 'text-kl-gray-600 hover:text-kl-black'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Git Log Timeline</span>
            </button>

            <button
              onClick={() => setViewMode('compact')}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'compact'
                  ? 'bg-kl-white text-kl-black shadow-xs'
                  : 'text-kl-gray-600 hover:text-kl-black'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              <span>Compact Log</span>
            </button>

            <button
              onClick={() => setViewMode('grid')}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-kl-white text-kl-black shadow-xs'
                  : 'text-kl-gray-600 hover:text-kl-black'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              <span>Card Grid</span>
            </button>
          </div>
        </div>

        {/* Filter Selection Row: Status, Severity, Date Preset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-kl-gray-200/60">
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. Status Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-kl-gray-500">Status:</span>
              <div className="inline-flex rounded-lg border border-kl-gray-200 bg-kl-white p-0.5">
                {(['all', 'active', 'resolved'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    type="button"
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-all ${
                      statusFilter === st
                        ? 'bg-kl-black text-white'
                        : 'text-kl-gray-600 hover:text-kl-black'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Severity Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-kl-gray-500">Severity:</span>
              <div className="inline-flex rounded-lg border border-kl-gray-200 bg-kl-white p-0.5">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    type="button"
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition-all ${
                      severityFilter === sev
                        ? sev === 'critical'
                          ? 'bg-red-600 text-white font-bold'
                          : sev === 'high'
                          ? 'bg-kl-orange text-white font-bold'
                          : 'bg-kl-black text-white font-bold'
                        : 'text-kl-gray-600 hover:text-kl-black'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Date Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-kl-gray-500">Date:</span>
              <div className="inline-flex rounded-lg border border-kl-gray-200 bg-kl-white p-0.5">
                {[
                  { key: 'all', label: 'All Time' },
                  { key: '24h', label: 'Last 24h' },
                  { key: '7d', label: '7 Days' },
                  { key: '30d', label: '30 Days' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDateFilter(key as DateRangeFilter)}
                    type="button"
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                      dateFilter === key
                        ? 'bg-kl-black text-white'
                        : 'text-kl-gray-600 hover:text-kl-black'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-kl-orange hover:underline cursor-pointer"
            >
              <span>Reset Filters</span>
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonIncidentCard key={i} />
            ))}
          </div>
        ) : viewMode === 'timeline' ? (
          /* 1. Git Log Timeline View (ChronoDB Spirit) */
          <div className="mt-2">
            <div className="mb-4 flex items-center justify-between text-xs text-kl-gray-500 px-2 font-mono">
              <span>Showing {filteredIncidents.length} of {totalCount} commit entries</span>
              <span className="italic">Click any incident commit to inspect evidence trail</span>
            </div>
            <GitLogTimeline
              incidents={filteredIncidents}
              onToggleStatus={handleToggleStatus}
            />
          </div>
        ) : viewMode === 'compact' ? (
          /* 2. Compact One-Line Git Log View */
          <div className="glass-card overflow-hidden">
            <div className="divide-y divide-kl-gray-200 font-mono text-xs">
              <div className="bg-kl-gray-100 px-4 py-2.5 font-bold text-kl-gray-600 flex items-center gap-4 text-[11px] uppercase tracking-wider">
                <span className="w-24">Commit</span>
                <span className="w-24">Severity</span>
                <span className="w-20">Status</span>
                <span className="flex-1">Root Cause Subject</span>
                <span className="w-28 text-right">Confidence</span>
                <span className="w-24 text-right">Date</span>
              </div>
              {filteredIncidents.length === 0 ? (
                <div className="p-8 text-center text-kl-gray-400">No incident commits match filters.</div>
              ) : (
                filteredIncidents.map((inc) => {
                  const sev = getIncidentSeverity(inc);
                  return (
                    <Link
                      key={inc.id}
                      href={`/incidents/${inc.id}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-orange-50/50 transition-colors group"
                    >
                      <span className="w-24 font-bold text-kl-orange group-hover:underline">
                        {inc.id}
                      </span>
                      <span className="w-24">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ color: sev.color, backgroundColor: sev.bgColor }}
                        >
                          {sev.label}
                        </span>
                      </span>
                      <span className="w-20">
                        <StatusBadge status={inc.status} />
                      </span>
                      <span className="flex-1 truncate font-sans font-medium text-kl-black group-hover:text-kl-orange">
                        {inc.root_cause_summary || 'Incident detected'}
                      </span>
                      <span className="w-28 text-right font-bold text-kl-gray-700">
                        {Math.round(inc.confidence * 100)}%
                      </span>
                      <span className="w-24 text-right text-kl-gray-400 text-[11px]">
                        {new Date(inc.created_at).toLocaleDateString()}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* 3. Card Grid View */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredIncidents.length === 0 ? (
              <div className="col-span-2 py-16 text-center text-kl-gray-400">
                No incidents match the active filters.
              </div>
            ) : (
              filteredIncidents.map((inc, i) => (
                <IncidentCard key={inc.id} incident={inc} delay={i * 80} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
