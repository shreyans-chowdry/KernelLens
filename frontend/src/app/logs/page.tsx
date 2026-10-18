'use client';

import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import LogRow from '@/components/LogRow';
import { EmptyPipeline, ErrorNotice, LoadingBlock } from '@/components/States';
import { fetchLogs, fetchLogStats } from '@/lib/api';
import { logLevel, pct, plural } from '@/lib/format';
import { useResource } from '@/lib/useResource';

const PAGE = 100;

async function loadLogs() {
  const [logs, flaggedLogs, stats] = await Promise.all([
    fetchLogs({ limit: 500 }),
    fetchLogs({ is_anomalous: true, limit: 500 }),
    fetchLogStats(),
  ]);
  return { logs, flagged: new Set(flaggedLogs.map((l) => l.id)), stats };
}

function LogsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const flaggedOnly = params.get('flagged') === '1';

  const { data, error, loading, reload } = useResource(loadLogs, 'logs');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');
  const [visible, setVisible] = useState(PAGE);

  const setFlaggedOnly = (on: boolean) => {
    const sp = new URLSearchParams(params.toString());
    if (on) sp.set('flagged', '1');
    else sp.delete('flagged');
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ''}`, { scroll: false });
    setVisible(PAGE);
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.logs.filter((l) => {
      if (flaggedOnly && !data.flagged.has(l.id)) return false;
      if (source !== 'all' && l.source !== source) return false;
      if (level !== 'all' && logLevel(l) !== level) return false;
      if (q && !l.raw_text.toLowerCase().includes(q) && !(l.template_id || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, source, level, flaggedOnly]);

  if (error && !data) return <ErrorNotice error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingBlock label="Loading logs" lines={8} />;
  if (!data) return null;
  if (data.stats.total_logs === 0) return <EmptyPipeline onSeeded={reload} />;

  const sources = Object.entries(data.stats.sources).sort((a, b) => b[1] - a[1]);
  const flaggedCount = data.logs.filter((l) => data.flagged.has(l.id)).length;
  const filtersOn = query || source !== 'all' || level !== 'all' || flaggedOnly;

  return (
    <>
      <header className="page-head">
        <h1>Logs</h1>
        <p className="page-lede">
          {plural(data.stats.total_logs, 'event')} ingested, {data.stats.anomaly_count.toLocaleString()} flagged by the
          anomaly model ({pct(data.stats.anomaly_count, data.stats.total_logs)}).
          {data.logs.length < data.stats.total_logs && ` Showing the newest ${data.logs.length}.`}
        </p>
      </header>

      <div className="toolbar" role="search">
        <label className="search">
          <span className="sr-only">Search log lines</span>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE);
            }}
            placeholder="Search lines, e.g. ext4, oom, sda1"
          />
        </label>

        <label className="select">
          <span>Source</span>
          <select value={source} onChange={(e) => { setSource(e.target.value); setVisible(PAGE); }}>
            <option value="all">All sources</option>
            {sources.map(([s, n]) => (
              <option key={s} value={s}>{s} ({n})</option>
            ))}
          </select>
        </label>

        <label className="select">
          <span>Severity</span>
          <select value={level} onChange={(e) => { setLevel(e.target.value); setVisible(PAGE); }}>
            <option value="all">Any severity</option>
            <option value="crit">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>

        <label className="switch">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span>Flagged only ({flaggedCount})</span>
        </label>
      </div>

      <div className="console">
        <div className="console-head" aria-hidden="true">
          <span>Time</span>
          <span>Source</span>
          <span>Severity</span>
          <span>Message</span>
        </div>
        {filtered.length === 0 ? (
          <div className="quiet-empty console-empty">
            <p>No lines match these filters.</p>
            {filtersOn && (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                onClick={() => {
                  setQuery('');
                  setSource('all');
                  setLevel('all');
                  setFlaggedOnly(false);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="log-list">
            {filtered.slice(0, visible).map((l) => (
              <LogRow key={l.id} log={l} flagged={data.flagged.has(l.id)} />
            ))}
          </ul>
        )}
      </div>

      <div className="list-foot">
        <span>
          Showing {Math.min(visible, filtered.length)} of {filtered.length} matching lines
        </span>
        {visible < filtered.length && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setVisible((v) => v + PAGE)}>
            Show {Math.min(PAGE, filtered.length - visible)} more
          </button>
        )}
      </div>
    </>
  );
}

export default function LogsPage() {
  return (
    <div className="page">
      <Suspense fallback={<LoadingBlock label="Loading logs" lines={8} />}>
        <LogsView />
      </Suspense>
    </div>
  );
}
