import { pct } from '@/lib/format';

/**
 * How much of the log stream survives each pipeline stage.
 * All three rows are measured in events, so the bar lengths are comparable.
 */
export default function ReductionBar({
  total,
  flagged,
  inIncidents,
  incidentCount,
}: {
  total: number;
  flagged: number;
  inIncidents: number;
  incidentCount: number;
}) {
  const rows = [
    { key: 'all', label: 'Ingested', value: total, note: 'every line collected from dmesg, journalctl and files' },
    { key: 'flagged', label: 'Flagged', value: flagged, note: 'scored ≥ 0.65 by the Random Forest anomaly model' },
    {
      key: 'incidents',
      label: 'Sent to the LLM',
      value: inIncidents,
      note: `grouped into ${incidentCount} ${incidentCount === 1 ? 'incident' : 'incidents'} by semantic-temporal correlation`,
    },
  ];
  return (
    <div className="reduction">
      {rows.map((r) => (
        <div key={r.key} className={`reduction-row is-${r.key}`}>
          <div className="reduction-label">
            <span className="reduction-name">{r.label}</span>
            <span className="reduction-value">{r.value.toLocaleString()}</span>
          </div>
          <div className="reduction-track" aria-hidden="true">
            <span
              className="reduction-fill"
              style={{ width: total ? `max(${(r.value / total) * 100}%, ${r.value ? '3px' : '0px'})` : '0%' }}
            />
          </div>
          <p className="reduction-note">
            {r.key !== 'all' && <strong>{pct(r.value, total)} of the stream, </strong>}
            {r.note}
          </p>
        </div>
      ))}
    </div>
  );
}
