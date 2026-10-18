'use client';

import { useState } from 'react';
import type { LogEvent } from '@/lib/types';
import { formatClock, LEVEL_LABEL, logLevel, parseTs, splitKernelTime } from '@/lib/format';

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="muted">none</span>;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <span className="muted">none</span>;
    return (
      <span className="field-sublist">
        {entries.map(([k, v]) => (
          <span key={k}>
            {k}: <code>{Array.isArray(v) ? v.join(', ') : String(v)}</code>
          </span>
        ))}
      </span>
    );
  }
  return <code>{String(value)}</code>;
}

export default function LogRow({ log, flagged }: { log: LogEvent; flagged: boolean }) {
  const [open, setOpen] = useState(false);
  const lvl = logLevel(log);
  const { ktime, message } = splitKernelTime(log.raw_text);
  const pf = (log.parsed_fields || {}) as Record<string, unknown>;

  return (
    <li className={`log-row ${flagged ? 'is-flagged' : ''} ${open ? 'is-open' : ''}`}>
      <button type="button" className="log-row-main" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="log-time">{formatClock(log.timestamp)}</span>
        <span className="log-source">{log.source}</span>
        <span className={`log-level lvl-${lvl}`}>{LEVEL_LABEL[lvl]}</span>
        <code className="log-msg">{message}</code>
      </button>
      {open && (
        <dl className="log-fields">
          <div>
            <dt>Full line</dt>
            <dd><code className="wrap">{log.raw_text}</code></dd>
          </div>
          <div>
            <dt>Anomaly model</dt>
            <dd>{flagged ? 'Flagged as anomalous' : 'Not flagged'}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{parseTs(log.timestamp).toLocaleString('en-GB')}</dd>
          </div>
          {ktime && (
            <div>
              <dt>Kernel uptime</dt>
              <dd>{ktime} s</dd>
            </div>
          )}
          <div>
            <dt>Host</dt>
            <dd>{log.host}</dd>
          </div>
          <div>
            <dt>Subsystem</dt>
            <dd><FieldValue value={pf.subsystem} /></dd>
          </div>
          <div>
            <dt>Drain3 template</dt>
            <dd>
              <code>{log.template_id ?? 'none'}</code>
              {typeof pf.template_str === 'string' && <code className="wrap template">{pf.template_str}</code>}
            </dd>
          </div>
          <div>
            <dt>Extracted values</dt>
            <dd><FieldValue value={pf.extracted_params} /></dd>
          </div>
          <div>
            <dt>Event ID</dt>
            <dd><code>{log.id}</code></dd>
          </div>
        </dl>
      )}
    </li>
  );
}
