'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import KernelTrace from '@/components/KernelTrace';
import ReductionBar from '@/components/ReductionBar';
import IncidentRow from '@/components/IncidentRow';
import { EmptyPipeline, ErrorNotice, LoadingBlock } from '@/components/States';
import { fetchIncidents, fetchLogs, fetchPipelineStats } from '@/lib/api';
import { formatClock, incidentArea, parseTs, pct, plural, splitKernelTime } from '@/lib/format';
import { useResource } from '@/lib/useResource';

async function loadOverview() {
  const [stats, incidents, logs, flaggedLogs] = await Promise.all([
    fetchPipelineStats(),
    fetchIncidents({ limit: 100 }),
    fetchLogs({ limit: 500 }),
    fetchLogs({ is_anomalous: true, limit: 500 }),
  ]);
  return { stats, incidents, logs, flaggedLogs };
}

export default function OverviewPage() {
  const { data, error, loading, reload } = useResource(loadOverview, 'overview');

  const derived = useMemo(() => {
    if (!data) return null;
    const chronological = [...data.logs].sort(
      (a, b) => parseTs(a.timestamp).getTime() - parseTs(b.timestamp).getTime(),
    );
    const flagged = new Set(data.flaggedLogs.map((l) => l.id));
    const open = data.incidents.filter((i) => i.status === 'active');
    const inIncidents = new Set(data.incidents.flatMap((i) => i.correlated_event_ids ?? [])).size;
    const latestFlagged = data.flaggedLogs.slice(0, 8);
    return { chronological, flagged, open, inIncidents, latestFlagged };
  }, [data]);

  if (error && !data) return <ErrorNotice error={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className="page">
        <LoadingBlock label="Loading overview" lines={3} />
      </div>
    );
  }
  if (!data || !derived) return null;

  const { stats, incidents } = data;
  if (stats.total_logs === 0) {
    return (
      <div className="page">
        <EmptyPipeline onSeeded={reload} />
      </div>
    );
  }

  const openCount = derived.open.length;
  const title =
    openCount > 0
      ? `${plural(openCount, 'incident')} ${openCount === 1 ? 'needs' : 'need'} a look.`
      : incidents.length > 0
        ? 'Every incident is resolved.'
        : 'Nothing anomalous enough to open an incident.';

  return (
    <div className="page">
      <section className="hero" aria-labelledby="overview-title">
        <h1 id="overview-title" className="hero-title">{title}</h1>
        <p className="hero-lede">
          The anomaly model flagged {stats.anomaly_count.toLocaleString()} of {plural(stats.total_logs, 'kernel event')} (
          {pct(stats.anomaly_count, stats.total_logs)}). Correlation grouped them into {plural(incidents.length, 'incident')}, and
          only those events are passed to the LLM for root-cause analysis.
        </p>

        <KernelTrace
          events={derived.chronological}
          marked={derived.flagged}
          markedLabel="flagged as anomalous"
          caption={
            data.logs.length < stats.total_logs
              ? `The latest ${data.logs.length} of ${stats.total_logs} events, oldest on the left.`
              : undefined
          }
          brackets={incidents.map((i) => ({
            href: `/incidents/${i.id}`,
            label: incidentArea(i),
            eventIds: i.correlated_event_ids ?? [],
            open: i.status === 'active',
          }))}
        />
        <p className="trace-legend">
          <span className="legend-item"><span className="legend-swatch is-marked" aria-hidden="true" /> Flagged by the anomaly model</span>
          <span className="legend-item"><span className="legend-swatch" aria-hidden="true" /> Normal event (taller means higher severity)</span>
          <span className="legend-item"><span className="legend-bracket" aria-hidden="true" /> Incident, click to open</span>
        </p>
      </section>

      <section className="section" aria-labelledby="reduction-title">
        <div className="section-head">
          <h2 id="reduction-title">How much the LLM has to read</h2>
        </div>
        <ReductionBar
          total={stats.total_logs}
          flagged={stats.anomaly_count}
          inIncidents={derived.inIncidents}
          incidentCount={incidents.length}
        />
      </section>

      <div className="split">
        <section className="section" aria-labelledby="open-title">
          <div className="section-head">
            <h2 id="open-title">Open incidents</h2>
            <Link href="/incidents" className="text-link">All incidents</Link>
          </div>
          {derived.open.length === 0 ? (
            <p className="quiet-empty">No open incidents.</p>
          ) : (
            <ul className="incident-list is-compact">
              {derived.open.slice(0, 5).map((inc) => (
                <IncidentRow key={inc.id} incident={inc} />
              ))}
            </ul>
          )}
        </section>

        <section className="section" aria-labelledby="flagged-title">
          <div className="section-head">
            <h2 id="flagged-title">Latest flagged lines</h2>
            <Link href="/logs?flagged=1" className="text-link">All flagged lines</Link>
          </div>
          {derived.latestFlagged.length === 0 ? (
            <p className="quiet-empty">The model has not flagged anything yet.</p>
          ) : (
            <ol className="flag-list">
              {derived.latestFlagged.map((l) => (
                <li key={l.id}>
                  <span className="flag-time">{formatClock(l.timestamp)}</span>
                  <code className="flag-line">{splitKernelTime(l.raw_text).message}</code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
