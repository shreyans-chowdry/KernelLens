import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class LogEventModel(Base):
    """
    LogEvent entity:
    id, source [dmesg|journalctl|file|synthetic], raw_text, timestamp,
    template_id, parsed_fields, host
    """
    __tablename__ = "log_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    source: Mapped[str] = mapped_column(String(32), index=True)  # dmesg | journalctl | file | synthetic
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    parsed_fields: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    host: Mapped[str] = mapped_column(String(128), default="localhost", index=True)

    # Relationships
    anomaly_scores: Mapped[List["AnomalyScoreModel"]] = relationship(
        "AnomalyScoreModel", back_populates="log_event", cascade="all, delete-orphan"
    )
    evidence_items: Mapped[List["EvidenceModel"]] = relationship(
        "EvidenceModel", back_populates="log_event"
    )


class AnomalyScoreModel(Base):
    """
    AnomalyScore entity:
    id, log_event_id, model_version, score, is_anomalous
    """
    __tablename__ = "anomaly_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    log_event_id: Mapped[str] = mapped_column(String(36), ForeignKey("log_events.id", ondelete="CASCADE"), index=True)
    model_version: Mapped[str] = mapped_column(String(64), default="v1.0")
    score: Mapped[float] = mapped_column(Float, nullable=False)  # 0.0 to 1.0
    is_anomalous: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # Relationship
    log_event: Mapped["LogEventModel"] = relationship("LogEventModel", back_populates="anomaly_scores")


class IncidentModel(Base):
    """
    Incident entity:
    id, created_at, status [active|resolved], root_cause_summary,
    confidence, correlated_event_ids[]
    """
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)  # active | resolved
    root_cause_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    correlated_event_ids: Mapped[List[str]] = mapped_column(JSON, default=list)

    # Relationships
    evidence_list: Mapped[List["EvidenceModel"]] = relationship(
        "EvidenceModel", back_populates="incident", cascade="all, delete-orphan"
    )
    troubleshooting_suggestions: Mapped[List["TroubleshootingSuggestionModel"]] = relationship(
        "TroubleshootingSuggestionModel", back_populates="incident", cascade="all, delete-orphan"
    )


class EvidenceModel(Base):
    """
    Evidence entity:
    id, incident_id, log_event_id, explanation_snippet
    """
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    log_event_id: Mapped[str] = mapped_column(String(36), ForeignKey("log_events.id", ondelete="SET NULL"), nullable=True, index=True)
    explanation_snippet: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    incident: Mapped["IncidentModel"] = relationship("IncidentModel", back_populates="evidence_list")
    log_event: Mapped[Optional["LogEventModel"]] = relationship("LogEventModel", back_populates="evidence_items")


class TroubleshootingSuggestionModel(Base):
    """
    TroubleshootingSuggestion entity:
    id, incident_id, command_text, rationale
    Constraint: strictly read-only / copy-only diagnostic suggestions
    """
    __tablename__ = "troubleshooting_suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    command_text: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationship
    incident: Mapped["IncidentModel"] = relationship("IncidentModel", back_populates="troubleshooting_suggestions")


class ModelVersionModel(Base):
    """
    ModelVersion entity:
    id, type [classifier|embedding], trained_at, metrics_json
    """
    __tablename__ = "model_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    type: Mapped[str] = mapped_column(String(32), index=True)  # classifier | embedding
    version_tag: Mapped[str] = mapped_column(String(64), index=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    metrics_json: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
