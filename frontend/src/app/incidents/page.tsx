'use client';

import { useMemo, useState } from 'react';
import IncidentRow from '@/components/IncidentRow';
import { EmptyPipeline, ErrorNotice, LoadingBlock } from '@/components/States';
import { fetchIncidents, updateIncidentStatus } from '@/lib/api';
import { incidentArea, parseTs, plural, type Area } from '@/lib/format';
import type { Incident } from '@/lib/types';
import { useResource } from '@/lib/useResource';

type StatusFilter = 'all' | 'active' | 'resolved';

export default function IncidentsPage() {
  const { data, error, loading, reload, setData } = useResource(() => fetchIncidents({ limit: 100 }), 'incidents');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const incidents = useMemo(
    () => [...(data ?? [])].sort((a, b) => parseTs(b.created_at).getTime() - parseTs(a.created_at).getTime()),
    [data],
  );

  const areas = useMemo(() => {
    const m = new Map<Area, number>();
    incidents.forEach((i) => m.set(incidentArea(i), (m.get(incidentArea(i)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [incidents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter((i) => {
      if (status !== 'all' && i.status !== status) return false;
      if (area !== 'all' && incidentArea(i) !== area) return false;
      if (q) {
        const hay = [i.id, i.root_cause_summary ?? '', ...i.evidence_list.map((e) => e.explanation_snippet)]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, status, area, query]);

  const toggle = async (inc: Incident) => {
    const next = inc.status === 'active' ? 'resolved' : 'active';
    setBusyId(inc.id);
    setActionError(null);
    try {
      const updated = await updateIncidentStatus(inc.id, next);
      setData((prev) => prev?.map((i) => (i.id === inc.id ? { ...i, ...updated } : i)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (error && !data) {
    return (
      <div className="page">
        <ErrorNotice error={error} onRetry={reload} />
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="page">
        <LoadingBlock label="Loading incidents" lines={6} />
      </div>
    );
  }

  const openCount = incidents.filter((i) => i.status === 'active').length;

  if (incidents.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Incidents</h1>
        </header>
        <EmptyPipeline onSeeded={reload} />
      </div>
    );
  }

  const counts: Record<StatusFilter, number> = {
    active: openCount,
    resolved: incidents.length - openCount,
    all: incidents.length,
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Incidents</h1>
        <p className="page-lede">
          {plural(incidents.length, 'incident')} correlated from flagged kernel events, {openCount} still open. Each one
          carries the LLM&apos;s root cause, the log lines it cited, and commands to verify it.
        </p>
      </header>

      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Status">
          {(['active', 'resolved', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              className="segmented-item"
              onClick={() => setStatus(s)}
            >
              {s === 'active' ? 'Open' : s === 'resolved' ? 'Resolved' : 'All'}
              <span className="segmented-count">{counts[s]}</span>
            </button>
          ))}
        </div>

        <label className="select">
          <span>Area</span>
          <select value={area} onChange={(e) => setArea(e.target.value as Area | 'all')}>
            <option value="all">Every area</option>
            {areas.map(([a, n]) => (
              <option key={a} value={a}>{a} ({n})</option>
            ))}
          </select>
        </label>

        <label className="search">
          <span className="sr-only">Search incidents</span>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search root causes and evidence"
          />
        </label>
      </div>

      {actionError && <p className="field-error" role="alert">{actionError}</p>}

      {filtered.length === 0 ? (
        <div className="quiet-empty">
          <p>
            {status === 'active' && !query && area === 'all'
              ? 'No open incidents. Everything has been resolved.'
              : 'No incidents match these filters.'}
          </p>
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              setStatus('all');
              setArea('all');
              setQuery('');
            }}
          >
            Show all incidents
          </button>
        </div>
      ) : (
        <ul className="incident-list">
          {filtered.map((inc) => (
            <IncidentRow
              key={inc.id}
              incident={inc}
              action={
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  disabled={busyId === inc.id}
                  onClick={() => toggle(inc)}
                >
                  {busyId === inc.id ? 'Saving…' : inc.status === 'active' ? 'Resolve' : 'Reopen'}
                </button>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
