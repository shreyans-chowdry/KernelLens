/**
 * KernelLens AI — Unified API Client
 * Handles all communication with the FastAPI backend.
 * Falls back to mock data when the backend is unavailable.
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
import {
  MOCK_LOG_EVENTS,
  MOCK_INCIDENTS,
  MOCK_PIPELINE_STATS,
  MOCK_LOG_STATS,
  MOCK_TIMELINE,
} from './mock-data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ============================================
// Generic fetch wrapper with error handling
// ============================================
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  } catch (error) {
    console.warn(`API fetch failed for ${path}, using mock data:`, error);
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
    return MOCK_LOG_EVENTS;
  }
}

export async function fetchLogDetail(id: string): Promise<LogEventDetail> {
  try {
    return await apiFetch<LogEventDetail>(`/logs/${id}`);
  } catch {
    const event = MOCK_LOG_EVENTS.find((e) => e.id === id);
    if (!event) throw new Error('Log event not found');
    return { ...event, anomaly_scores: [] };
  }
}

export async function fetchLogStats(): Promise<LogStats> {
  try {
    return await apiFetch<LogStats>('/logs/stats');
  } catch {
    return MOCK_LOG_STATS;
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
    return MOCK_INCIDENTS;
  }
}

export async function fetchIncidentDetail(id: string): Promise<Incident> {
  try {
    return await apiFetch<Incident>(`/incidents/${id}`);
  } catch {
    const incident = MOCK_INCIDENTS.find((i) => i.id === id);
    if (!incident) throw new Error('Incident not found');
    const events = incident.events || MOCK_LOG_EVENTS.filter((e) => incident.correlated_event_ids.includes(e.id));
    return { ...incident, events };
  }
}

export async function fetchIncidentCount(status?: string): Promise<IncidentCount> {
  const qs = status ? `?status=${status}` : '';
  try {
    return await apiFetch<IncidentCount>(`/incidents/count${qs}`);
  } catch {
    return { count: MOCK_INCIDENTS.filter((i) => !status || i.status === status).length };
  }
}

export async function updateIncidentStatus(id: string, status: 'active' | 'resolved'): Promise<Incident> {
  return apiFetch<Incident>(`/incidents/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ============================================
// Analytics API
// ============================================
export async function fetchPipelineStats(): Promise<PipelineStats> {
  try {
    return await apiFetch<PipelineStats>('/analytics/pipeline');
  } catch {
    return MOCK_PIPELINE_STATS;
  }
}

export async function fetchTimeline(): Promise<TimelinePoint[]> {
  try {
    return await apiFetch<TimelinePoint[]>('/analytics/timeline');
  } catch {
    return MOCK_TIMELINE;
  }
}

// ============================================
// Demo API
// ============================================
export async function seedDemoData(): Promise<SeedResult> {
  return apiFetch<SeedResult>('/demo/seed', { method: 'POST' });
}
