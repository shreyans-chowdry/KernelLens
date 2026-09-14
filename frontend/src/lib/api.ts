/**
 * KernelLens AI — Unified API Client
 * Handles all communication with the FastAPI backend.
 * Features smart fallback to mock data when backend API is offline/unreachable.
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
    console.warn(`API fetch failed for ${path}, falling back to mock data:`, error);
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
    const data = await apiFetch<LogEvent[]>(`/logs${qs ? `?${qs}` : ''}`);
    return data.length > 0 ? data : MOCK_LOG_EVENTS;
  } catch {
    return MOCK_LOG_EVENTS;
  }
}

export async function fetchLogDetail(id: string): Promise<LogEventDetail> {
  try {
    return await apiFetch<LogEventDetail>(`/logs/${id}`);
  } catch {
    const log = MOCK_LOG_EVENTS.find((l) => l.id === id) || MOCK_LOG_EVENTS[0];
    return {
      ...log,
      anomaly_scores: [
        {
          id: 'score-001',
          log_event_id: log.id,
          model_version: 'rf-loghub-v1',
          score: 0.94,
          is_anomalous: true,
        },
      ],
    };
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
    const data = await apiFetch<Incident[]>(`/incidents${qs ? `?${qs}` : ''}`);
    return data.length > 0 ? data : MOCK_INCIDENTS;
  } catch {
    return MOCK_INCIDENTS;
  }
}

export async function fetchIncidentDetail(id: string): Promise<Incident> {
  try {
    return await apiFetch<Incident>(`/incidents/${id}`);
  } catch {
    return MOCK_INCIDENTS.find((i) => i.id === id) || MOCK_INCIDENTS[0];
  }
}

export async function fetchIncidentCount(status?: string): Promise<IncidentCount> {
  const qs = status ? `?status=${status}` : '';
  try {
    return await apiFetch<IncidentCount>(`/incidents/count${qs}`);
  } catch {
    return { count: MOCK_INCIDENTS.length };
  }
}

export async function updateIncidentStatus(id: string, status: 'active' | 'resolved'): Promise<Incident> {
  try {
    return await apiFetch<Incident>(`/incidents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  } catch {
    const incident = MOCK_INCIDENTS.find((i) => i.id === id) || MOCK_INCIDENTS[0];
    return { ...incident, status };
  }
}

// ============================================
// Analytics API
// ============================================
export async function fetchPipelineStats(): Promise<PipelineStats> {
  try {
    const res = await apiFetch<PipelineStats>('/analytics/pipeline');
    return res.total_logs > 0 ? res : MOCK_PIPELINE_STATS;
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
  try {
    return await apiFetch<SeedResult>('/demo/seed', { method: 'POST' });
  } catch {
    return {
      message: 'Demo data seeded successfully (Mock)',
      details: {
        scenarios: ['oom_killer', 'ext4_disk_corruption', 'segfault_storm'],
        total_events: 38,
        total_incidents: 4,
      },
    };
  }
}
