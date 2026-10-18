import Link from 'next/link';
import type { Incident } from '@/lib/types';
import { formatRelative, headline, incidentArea, plural } from '@/lib/format';

export function StatusTag({ status }: { status: Incident['status'] }) {
  return (
    <span className={`status-tag ${status === 'active' ? 'is-open' : 'is-resolved'}`}>
      <span className="status-tag-dot" aria-hidden="true" />
      {status === 'active' ? 'Open' : 'Resolved'}
    </span>
  );
}

export function ConfidenceMeter({ value, wide = false }: { value: number; wide?: boolean }) {
  const pctVal = Math.round(value * 100);
  return (
    <span className={`meter ${wide ? 'is-wide' : ''}`} title={`Analysis confidence ${pctVal}%`}>
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${pctVal}%` }} />
      </span>
      <span className="meter-value">{pctVal}%</span>
      <span className="sr-only">confidence</span>
    </span>
  );
}

export default function IncidentRow({
  incident,
  action,
}: {
  incident: Incident;
  action?: React.ReactNode;
}) {
  const events = incident.correlated_event_ids?.length ?? 0;
  return (
    <li className="incident-row">
      <div className="incident-row-meta">
        <StatusTag status={incident.status} />
        <span className="incident-area">{incidentArea(incident)}</span>
      </div>
      <Link href={`/incidents/${incident.id}`} className="incident-row-title">
        {headline(incident.root_cause_summary)}
      </Link>
      <div className="incident-row-facts">
        <span>{plural(events, 'event')}</span>
        <span>{plural(incident.evidence_list.length, 'citation')}</span>
        <span>{formatRelative(incident.created_at)}</span>
      </div>
      <div className="incident-row-end">
        <ConfidenceMeter value={incident.confidence} />
        {action}
      </div>
    </li>
  );
}
