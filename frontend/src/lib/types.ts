/**
 * KernelLens AI — TypeScript Type Definitions
 * Mirrors the backend Pydantic schemas for type-safe API consumption.
 */

// ============================================
// Log Events
// ============================================
export interface LogEvent {
  id: string;
  source: 'dmesg' | 'journalctl' | 'file' | 'synthetic';
  raw_text: string;
  timestamp: string;
  template_id: string | null;
  parsed_fields: Record<string, unknown>;
  host: string;
}

export interface AnomalyScore {
  id: string;
  log_event_id: string;
  model_version: string;
  score: number;
  is_anomalous: boolean;
}

export interface LogEventDetail extends LogEvent {
  anomaly_scores: AnomalyScore[];
}

export interface LogStats {
  total_logs: number;
  anomaly_count: number;
  sources: Record<string, number>;
}

// ============================================
// Incidents
// ============================================
export interface Evidence {
  id: string;
  incident_id: string;
  log_event_id: string | null;
  explanation_snippet: string;
}

export interface TroubleshootingSuggestion {
  id: string;
  incident_id: string;
  command_text: string;
  rationale: string;
}

export interface Incident {
  id: string;
  created_at: string;
  status: 'active' | 'resolved';
  root_cause_summary: string | null;
  confidence: number;
  correlated_event_ids: string[];
  evidence_list: Evidence[];
  troubleshooting_suggestions: TroubleshootingSuggestion[];
  events?: LogEvent[];
}

export interface IncidentCount {
  count: number;
}

// ============================================
// Analytics
// ============================================
export interface PipelineStats {
  total_logs: number;
  anomaly_count: number;
  incident_count: number;
  active_incidents: number;
  resolved_incidents: number;
  reduction_ratio_pct: number;
}

export interface TimelinePoint {
  hour: string;
  count: number;
}

// ============================================
// Demo
// ============================================
export interface SeedResult {
  message: string;
  details: {
    scenarios: string[];
    total_events: number;
    total_incidents: number;
  };
}
