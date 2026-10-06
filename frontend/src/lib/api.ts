/**
 * KernelLens AI — Unified API Client
 * Handles all communication with the FastAPI backend.
 * Returns authentic live telemetry; clean empty states when database is cleared.
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ============================================
// Generic fetch wrapper with error handling
// ============================================
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.warn(`API fetch failed for ${path}:`, error);
    throw error;
  }
}

// ============================================
// Log Events API
// ============================================
export async function fetchLogs(params?: {
  source?: string;
  host?: string;
  is_anomalous?: boolean;
  limit?: number;
  offset?: number;
}): Promise<LogEvent[]> {
  const searchParams = new URLSearchParams();
  if (params?.source) searchParams.set('source', params.source);
  if (params?.host) searchParams.set('host', params.host);
  if (params?.is_anomalous !== undefined) searchParams.set('is_anomalous', String(params.is_anomalous));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  try {
    return await apiFetch<LogEvent[]>(`/logs${qs ? `?${qs}` : ''}`);
  } catch {
    return [];
  }
}

export async function fetchLogDetail(id: string): Promise<LogEventDetail | null> {
  try {
    return await apiFetch<LogEventDetail>(`/logs/${id}`);
  } catch {
    return null;
  }
}

export async function fetchLogStats(): Promise<LogStats> {
  try {
    return await apiFetch<LogStats>('/logs/stats');
  } catch {
    return { total_logs: 0, anomaly_count: 0, sources: {} };
  }
}

// ============================================
// Incidents API
// ============================================
export async function fetchIncidents(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Incident[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  try {
    return await apiFetch<Incident[]>(`/incidents${qs ? `?${qs}` : ''}`);
  } catch {
    return [];
  }
}

export async function fetchIncidentDetail(id: string): Promise<Incident | null> {
  try {
    return await apiFetch<Incident>(`/incidents/${id}`);
  } catch {
    return null;
  }
}

export async function fetchIncidentCount(status?: string): Promise<IncidentCount> {
  const qs = status ? `?status=${status}` : '';
  try {
    return await apiFetch<IncidentCount>(`/incidents/count${qs}`);
  } catch {
    return { count: 0 };
  }
}

export async function updateIncidentStatus(id: string, status: 'active' | 'resolved'): Promise<Incident | null> {
  try {
    return await apiFetch<Incident>(`/incidents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  } catch {
    return null;
  }
}

// ============================================
// Analytics API
// ============================================
export async function fetchPipelineStats(): Promise<PipelineStats> {
  try {
    return await apiFetch<PipelineStats>('/analytics/pipeline');
  } catch {
    return {
      total_logs: 0,
      anomaly_count: 0,
      incident_count: 0,
      active_incidents: 0,
      resolved_incidents: 0,
      reduction_ratio_pct: 0,
    };
  }
}

export async function fetchTimeline(): Promise<TimelinePoint[]> {
  try {
    return await apiFetch<TimelinePoint[]>('/analytics/timeline');
  } catch {
    return [];
  }
}

// ============================================
// Demo API
// ============================================
export async function seedDemoData(): Promise<SeedResult> {
  return apiFetch<SeedResult>('/demo/seed', { method: 'POST' });
}
