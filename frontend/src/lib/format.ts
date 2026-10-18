/**
 * Shared formatting and derivation helpers.
 */
import type { Incident, LogEvent } from './types';

/** SQLite returns naive timestamps (UTC). Treat a missing offset as UTC. */
export function parseTs(ts: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
}

export function formatClock(ts: string): string {
  return parseTs(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(ts: string): string {
  return parseTs(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(ts: string): string {
  const diff = Date.now() - parseTs(ts).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function pct(n: number, total: number): string {
  if (total <= 0) return '0%';
  const v = (n / total) * 100;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export type LogLevel = 'crit' | 'error' | 'warning' | 'info';

export function logLevel(log: LogEvent): LogLevel {
  const lvl = String((log.parsed_fields as Record<string, unknown>)?.log_level ?? 'info');
  if (lvl === 'crit' || lvl === 'emerg' || lvl === 'alert') return 'crit';
  if (lvl === 'error') return 'error';
  if (lvl === 'warning') return 'warning';
  return 'info';
}

export const LEVEL_LABEL: Record<LogLevel, string> = {
  crit: 'Critical',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/** Strip the "[ 1234.5678]" ring-buffer prefix for display; return it separately. */
export function splitKernelTime(raw: string): { ktime: string | null; message: string } {
  const m = raw.match(/^\[\s*(\d+\.\d+)\]\s*(.*)$/);
  return m ? { ktime: m[1], message: m[2] } : { ktime: null, message: raw };
}

export type Area = 'Storage' | 'Memory' | 'CPU & thermal' | 'Network' | 'Process crash' | 'Kernel';

/** Rough subsystem guess from the root-cause text, used for grouping and filtering. */
export function incidentArea(incident: Pick<Incident, 'root_cause_summary'>): Area {
  const t = (incident.root_cause_summary || '').toLowerCase();
  if (/(oom|out of memory|memory exhaustion|page allocation)/.test(t)) return 'Memory';
  if (/(ext4|sda|disk|block device|i\/o|sector|filesystem)/.test(t)) return 'Storage';
  if (/(thermal|temperature|throttl)/.test(t)) return 'CPU & thermal';
  if (/(segfault|segmentation|general protection|core dump)/.test(t)) return 'Process crash';
  if (/(eth\d|network|link down|netdev|carrier)/.test(t)) return 'Network';
  return 'Kernel';
}

/** First sentence of the root cause, for list titles. */
export function headline(text: string | null): string {
  if (!text) return 'Waiting for root-cause analysis';
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : text).trim();
}
