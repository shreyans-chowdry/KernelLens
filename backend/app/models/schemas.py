from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


# ==========================================
# 1. LogEvent Schemas
# ==========================================
class LogEventBase(BaseModel):
    source: Literal["dmesg", "journalctl", "file", "synthetic"]
    raw_text: str
    host: str = "localhost"


class LogEventCreate(LogEventBase):
    timestamp: Optional[datetime] = None
    template_id: Optional[str] = None
    parsed_fields: Dict[str, Any] = Field(default_factory=dict)


class LogEventRead(LogEventBase):
    id: str
    timestamp: datetime
    template_id: Optional[str] = None
    parsed_fields: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 2. AnomalyScore Schemas
# ==========================================
class AnomalyScoreBase(BaseModel):
    log_event_id: str
    model_version: str = "v1.0"
    score: float = Field(ge=0.0, le=1.0, description="Anomaly probability or outlier score")
    is_anomalous: bool


class AnomalyScoreCreate(AnomalyScoreBase):
    pass


class AnomalyScoreRead(AnomalyScoreBase):
    id: str

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 3. Context Payload (Novelty Point 1)
# ==========================================
class IncidentEventSummary(BaseModel):
    event_id: str
    timestamp: str
    source: str
    template_id: Optional[str] = None
    template_text: Optional[str] = None
    extracted_params: Dict[str, Any] = Field(default_factory=dict)
    anomaly_score: float
    raw_snippet: str


class ContextPayload(BaseModel):
    """
    Reduced, correlated incident context assembled for LLM root-cause analysis.
    The LLM ONLY sees this pre-correlated context, NEVER the raw full log stream.
    """
    cluster_id: str
    time_window_start: str
    time_window_end: str
    total_raw_logs_processed: int
    anomalous_events_count: int
    correlated_events_count: int
    reduction_ratio_pct: float
    primary_suspect_subsystem: str
    events: List[IncidentEventSummary]
    host_info: Dict[str, Any] = Field(default_factory=dict)


# ==========================================
# 4. LLM Root-Cause Reasoning Schemas
# ==========================================
class EvidenceItem(BaseModel):
    log_event_id: Optional[str] = None
    explanation_snippet: str = Field(..., description="Why this specific event is evidence of the root cause")


class CommandSuggestion(BaseModel):
    command_text: str = Field(..., description="Safe, read-only diagnostic command (e.g., smartctl, vmstat, dmesg)")
    rationale: str = Field(..., description="Why running this command confirms or clarifies the incident")


class RootCauseAnalysisResult(BaseModel):
    """
    Strictly enforced Pydantic output schema for LLM root-cause analysis.
    Must never be a free-text blob.
    """
    cause: str = Field(..., min_length=5, description="Identified root cause summary")
    evidence: List[EvidenceItem] = Field(..., min_length=1, description="List of evidence items linking to specific events")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0")
    troubleshooting_commands: List[CommandSuggestion] = Field(
        ..., description="Copy-only troubleshooting and diagnostic guidance commands"
    )


# ==========================================
# 5. Incident & Evidence Schemas
# ==========================================
class EvidenceRead(BaseModel):
    id: str
    incident_id: str
    log_event_id: Optional[str] = None
    explanation_snippet: str

    model_config = ConfigDict(from_attributes=True)


class TroubleshootingSuggestionRead(BaseModel):
    id: str
    incident_id: str
    command_text: str
    rationale: str

    model_config = ConfigDict(from_attributes=True)


class IncidentRead(BaseModel):
    id: str
    created_at: datetime
    status: Literal["active", "resolved"]
    root_cause_summary: Optional[str] = None
    confidence: float
    correlated_event_ids: List[str] = Field(default_factory=list)
    evidence_list: List[EvidenceRead] = Field(default_factory=list)
    troubleshooting_suggestions: List[TroubleshootingSuggestionRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 6. ModelVersion Schemas
# ==========================================
class ModelVersionRead(BaseModel):
    id: str
    type: Literal["classifier", "embedding"]
    version_tag: str
    trained_at: datetime
    metrics_json: Dict[str, Any]

    model_config = ConfigDict(from_attributes=True)
