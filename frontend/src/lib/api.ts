/**
 * KernelLens AI — API client for the FastAPI backend.
 * Every function throws ApiError on failure so pages can tell
 * "backend unreachable" apart from "no data yet".
 */

import type {
  LogEvent,
  LogEventDetail,
  LogStats,
  Incident,
  IncidentCount,
  PipelineStats,
  TimelinePoint,
  SeedResult,
} from './types';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

/**
 * True when the page is served from a real domain (e.g. Vercel) but still points at
 * localhost, i.e. NEXT_PUBLIC_API_URL was not set when the site was built.
 * The browser would look for the API on the visitor's own machine.
 */
export function backendNotConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  const pageIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const apiIsLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(API_BASE);
  return !pageIsLocal && apiIsLocal;
}

export class ApiError extends Error {
  constructor(message: string, public status: number | null) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    throw new ApiError(
      timedOut
        ? `The KernelLens backend at ${API_BASE} did not answer within ${Math.round(timeoutMs / 1000)} s.`
        : `Can't reach the KernelLens backend at ${API_BASE}.`,
      null,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `The backend returned ${res.status}.`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------- Health ----------
export async function checkHealth(): Promise<boolean> {
  const root = API_BASE.replace(/\/api\/v1\/?$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${root}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Logs ----------
export function fetchLogs(params: {
  source?: string;
  host?: string;
  is_anomalous?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<LogEvent[]> {
  return apiFetch<LogEvent[]>(`/logs${qs(params)}`);
}

export function fetchLogDetail(id: string): Promise<LogEventDetail> {
  return apiFetch<LogEventDetail>(`/logs/${encodeURIComponent(id)}`);
}

export function fetchLogStats(): Promise<LogStats> {
  return apiFetch<LogStats>('/logs/stats');
}

// ---------- Incidents ----------
export function fetchIncidents(params: { status?: 'active' | 'resolved'; limit?: number } = {}): Promise<Incident[]> {
  return apiFetch<Incident[]>(`/incidents${qs(params)}`);
}

export function fetchIncidentDetail(id: string): Promise<Incident> {
  return apiFetch<Incident>(`/incidents/${encodeURIComponent(id)}`);
}

export function fetchIncidentCount(status?: 'active' | 'resolved'): Promise<IncidentCount> {
  return apiFetch<IncidentCount>(`/incidents/count${qs({ status })}`);
}

export function updateIncidentStatus(id: string, status: 'active' | 'resolved'): Promise<Incident> {
  return apiFetch<Incident>(`/incidents/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** Runs the LLM root-cause stage again. Gemini can take several seconds. */
export function analyzeIncident(id: string): Promise<Incident> {
  return apiFetch<Incident>(`/incidents/${encodeURIComponent(id)}/analyze`, { method: 'POST' }, 90000);
}

// ---------- Analytics ----------
export function fetchPipelineStats(): Promise<PipelineStats> {
  return apiFetch<PipelineStats>('/analytics/pipeline');
}

export function fetchTimeline(): Promise<TimelinePoint[]> {
  return apiFetch<TimelinePoint[]>('/analytics/timeline');
}

// ---------- Demo ----------
export function seedDemoData(): Promise<SeedResult> {
  return apiFetch<SeedResult>('/demo/seed', { method: 'POST' }, 30000);
}
