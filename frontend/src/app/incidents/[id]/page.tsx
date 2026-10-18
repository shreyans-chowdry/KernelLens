'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import CopyButton from '@/components/CopyButton';
import KernelTrace from '@/components/KernelTrace';
import { ConfidenceMeter, StatusTag } from '@/components/IncidentRow';
import { ErrorNotice, LoadingBlock } from '@/components/States';
import { analyzeIncident, fetchIncidentDetail, updateIncidentStatus } from '@/lib/api';
import { formatClock, formatDateTime, incidentArea, parseTs, plural, splitKernelTime } from '@/lib/format';
import { useResource } from '@/lib/useResource';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: incident, error, loading, reload, setData } = useResource(() => fetchIncidentDetail(id), `incident:${id}`);

  const [busy, setBusy] = useState<'status' | 'analyze' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [citedOnly, setCitedOnly] = useState(false);

  const view = useMemo(() => {
    if (!incident) return null;
    const events = [...(incident.events ?? [])].sort(
      (a, b) => parseTs(a.timestamp).getTime() - parseTs(b.timestamp).getTime(),
    );
    const eventIds = new Set(events.map((e) => e.id));
    // Citation number = order in which the analysis listed the evidence
    const citations = new Map<string, { n: number; note: string }[]>();
    incident.evidence_list.forEach((ev, i) => {
      if (!ev.log_event_id) return;
      const list = citations.get(ev.log_event_id) ?? [];
      list.push({ n: i + 1, note: ev.explanation_snippet });
      citations.set(ev.log_event_id, list);
    });
    const orphanEvidence = incident.evidence_list
      .map((ev, i) => ({ ...ev, n: i + 1 }))
      .filter((ev) => !ev.log_event_id || !eventIds.has(ev.log_event_id));
    const cited = new Set([...citations.keys()].filter((k) => eventIds.has(k)));
    return { events, citations, cited, orphanEvidence };
  }, [incident]);

  if (error && !incident) {
    if (error.status === 404) {
      return (
        <div className="page">
          <Link href="/incidents" className="back-link">Incidents</Link>
          <div className="notice">
            <p className="notice-title">There is no incident with this ID.</p>
            <p className="notice-body">It may have been removed when the database was reset. Pick one from the incident list instead.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorNotice error={error} onRetry={reload} />
      </div>
    );
  }
  if (loading && !incident) {
    return (
      <div className="page">
        <LoadingBlock label="Loading incident" lines={6} />
      </div>
    );
  }
  if (!incident || !view) return null;

  const toggleStatus = async () => {
    setBusy('status');
    setActionError(null);
    try {
      const updated = await updateIncidentStatus(incident.id, incident.status === 'active' ? 'resolved' : 'active');
      // The PATCH response has no `events`, so merge rather than replace
      setData((prev) => (prev ? { ...prev, ...updated, events: prev.events } : prev));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const rerun = async () => {
    setBusy('analyze');
    setActionError(null);
    try {
      const updated = await analyzeIncident(incident.id);
      setData(() => updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const commands = incident.troubleshooting_suggestions;
  const script = commands.map((c) => `# ${c.rationale}\n${c.command_text}`).join('\n\n');
  const shownEvents = citedOnly ? view.events.filter((e) => view.cited.has(e.id)) : view.events;

  return (
    <div className="page">
      <Link href="/incidents" className="back-link">Incidents</Link>

      <header className="incident-head">
        <div className="incident-head-meta">
          <StatusTag status={incident.status} />
          <span>{incidentArea(incident)}</span>
          <span>Opened {formatDateTime(incident.created_at)}</span>
        </div>

        <h1 className="incident-cause">{incident.root_cause_summary ?? 'This incident has not been analysed yet.'}</h1>

        <div className="incident-head-foot">
          <div className="confidence-block">
            <span className="confidence-label">Analysis confidence</span>
            <ConfidenceMeter value={incident.confidence} wide />
          </div>
          <div className="incident-actions">
            <button type="button" className="btn btn-quiet" onClick={rerun} disabled={busy !== null}>
              {busy === 'analyze' ? 'Analysing…' : 'Run analysis again'}
            </button>
            <button type="button" className="btn btn-primary" onClick={toggleStatus} disabled={busy !== null}>
              {busy === 'status' ? 'Saving…' : incident.status === 'active' ? 'Mark resolved' : 'Reopen incident'}
            </button>
          </div>
        </div>
        {busy === 'analyze' && (
          <p className="hint" role="status">Sending the correlated events to the analysis engine. With Gemini this takes a few seconds.</p>
        )}
        {actionError && <p className="field-error" role="alert">{actionError}</p>}
      </header>

      {view.events.length > 0 && (
        <section className="section" aria-labelledby="trace-title">
          <div className="section-head">
            <h2 id="trace-title">Event sequence</h2>
            <span className="section-note">
              {plural(view.events.length, 'correlated event')}, {view.cited.size} cited as evidence
            </span>
          </div>
          <KernelTrace
            events={view.events}
            marked={view.cited}
            markedLabel="cited as evidence"
            height={84}
            caption={`${view.events.length} events between ${formatClock(view.events[0].timestamp)} and ${formatClock(view.events[view.events.length - 1].timestamp)}.`}
          />
        </section>
      )}

      <section className="section" aria-labelledby="evidence-title">
        <div className="section-head">
          <h2 id="evidence-title">Evidence</h2>
          {view.events.length > 0 && (
            <label className="switch">
              <input type="checkbox" checked={citedOnly} onChange={(e) => setCitedOnly(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span>Cited lines only</span>
            </label>
          )}
        </div>
        <p className="section-lede">
          The lines the analysis relied on are marked, with its reasoning beside each one. Uncited lines are the rest of
          the correlated sequence, kept for context.
        </p>

        {view.events.length === 0 ? (
          <p className="quiet-empty">The log events for this incident are no longer in the database.</p>
        ) : (
          <ol className="annotated">
            {shownEvents.map((ev) => {
              const notes = view.citations.get(ev.id);
              const { ktime, message } = splitKernelTime(ev.raw_text);
              return (
                <li key={ev.id} className={`annotated-row ${notes ? 'is-cited' : ''}`}>
                  <div className="annotated-line">
                    <span className="annotated-time">{ktime ? `${ktime}` : formatClock(ev.timestamp)}</span>
                    <code>{message}</code>
                  </div>
                  {notes && (
                    <div className="annotated-notes">
                      {notes.map((n) => (
                        <p key={n.n} className="annotated-note">
                          <span className="citation-num" aria-label={`Citation ${n.n}`}>{n.n}</span>
                          {n.note}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {view.orphanEvidence.length > 0 && (
          <div className="orphan-evidence">
            <h3>Evidence without a matching log line</h3>
            <ul>
              {view.orphanEvidence.map((ev) => (
                <li key={ev.id}>
                  <span className="citation-num">{ev.n}</span>
                  {ev.explanation_snippet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="commands-title">
        <div className="section-head">
          <h2 id="commands-title">Check it yourself</h2>
          {commands.length > 1 && <CopyButton text={script} label="Copy all as a script" doneLabel="Script copied" />}
        </div>
        <p className="section-lede">
          KernelLens never runs these. Read each command and check the device names and privileges before pasting it
          into a terminal on the affected machine.
        </p>
        {commands.length === 0 ? (
          <p className="quiet-empty">No commands were suggested. Run the analysis again to generate some.</p>
        ) : (
          <ol className="commands">
            {commands.map((c) => (
              <li key={c.id} className="command">
                <div className="command-bar">
                  <pre className="command-text"><span className="prompt" aria-hidden="true">$ </span>{c.command_text}</pre>
                  <CopyButton text={c.command_text} />
                </div>
                <p className="command-why">{c.rationale}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
