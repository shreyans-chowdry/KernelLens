# =========================================================================
# THROWAWAY MVP SCAFFOLD — TEMPORAL EVENT CORRELATION
# 
# WARNING: This fixed time-window correlation is a temporary placeholder!
# Per Section 3.3 of our Review 1 report ("LLM-Driven Dynamic Kernel Log
# Root Cause Analyzer"), Event Correlation MUST use a trained semantic
# similarity and embedding model (TF-IDF / sentence-transformers + temporal
# clustering), not raw sliding windows without semantic awareness.
#
# This temporary temporal correlation step exists ONLY as an MVP scaffold
# to allow downstream pipeline stages (Context Construction, LLM Root-Cause
# Analysis, and Dashboard) to be developed and demoed end-to-end before
# the real trained ML model is finalized in Phase 2.
#
# DO NOT RETAIN THIS IN THE FINAL LAB EVALUATION OR FINAL PROJECT RELEASE.
# =========================================================================

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import LogEventModel, IncidentModel
from backend.app.core.database import AsyncSessionLocal


@dataclass
class IncidentCluster:
    """
    Representation of a correlated group of candidate anomalous events.
    Forms the candidate incident boundary for context construction.
    """
    cluster_id: str
    events: List[LogEventModel] = field(default_factory=list)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    @property
    def event_count(self) -> int:
        return len(self.events)

    @property
    def duration_seconds(self) -> float:
        if self.start_time and self.end_time:
            return max(0.0, (self.end_time - self.start_time).total_seconds())
        return 0.0

    @property
    def event_ids(self) -> List[str]:
        return [e.id for e in self.events]


class TemporalCorrelationScaffold:
    """
    Temporary Throwaway MVP Scaffold for Event Correlation.
    Buckets candidate anomalous events into the same incident if they occur
    within a fixed time window (default 30 seconds) of each other.
    """

    def __init__(self, window_seconds: float = 30.0):
        self.window_seconds = window_seconds

    def correlate_events(
        self, candidate_events: List[LogEventModel], window_seconds: Optional[float] = None
    ) -> List[IncidentCluster]:
        """
        Core operation: correlate_events(candidate_events, window) -> list[IncidentCluster]
        Buckets candidate anomalous events based on temporal proximity.
        """
        if not candidate_events:
            return []

        window = window_seconds if window_seconds is not None else self.window_seconds

        # Sort events chronologically
        sorted_events = sorted(
            candidate_events,
            key=lambda e: e.timestamp or datetime.min.replace(tzinfo=timezone.utc),
        )

        clusters: List[IncidentCluster] = []
        current_cluster: Optional[IncidentCluster] = None

        for event in sorted_events:
            event_ts = event.timestamp
            if event_ts is None:
                event_ts = datetime.now(timezone.utc)

            if current_cluster is None:
                current_cluster = IncidentCluster(
                    cluster_id=f"cluster_{uuid.uuid4().hex[:8]}",
                    events=[event],
                    start_time=event_ts,
                    end_time=event_ts,
                )
            else:
                # Calculate time gap between current event and previous event in cluster
                gap_seconds = (event_ts - current_cluster.end_time).total_seconds()
                if gap_seconds <= window:
                    current_cluster.events.append(event)
                    current_cluster.end_time = max(current_cluster.end_time, event_ts)
                else:
                    # Seal current cluster and begin a new one
                    clusters.append(current_cluster)
                    current_cluster = IncidentCluster(
                        cluster_id=f"cluster_{uuid.uuid4().hex[:8]}",
                        events=[event],
                        start_time=event_ts,
                        end_time=event_ts,
                    )

        if current_cluster is not None:
            clusters.append(current_cluster)

        return clusters

    def to_incident_model(self, cluster: IncidentCluster) -> IncidentModel:
        """
        Converts an IncidentCluster into an IncidentModel database entity.
        """
        now = datetime.now(timezone.utc)
        return IncidentModel(
            id=str(uuid.uuid4()),
            created_at=cluster.start_time or now,
            status="active",
            root_cause_summary=None,
            confidence=0.0,
            correlated_event_ids=cluster.event_ids,
        )


# Global singleton instance
_correlation_scaffold = TemporalCorrelationScaffold(window_seconds=30.0)


def correlate_events(
    candidate_events: List[LogEventModel], window_seconds: float = 30.0
) -> List[IncidentCluster]:
    """
    Functional interface: correlate_events(candidate_events, window) -> list[IncidentCluster]
    (Throwaway MVP scaffold implementation)
    """
    scaffold = TemporalCorrelationScaffold(window_seconds=window_seconds)
    return scaffold.correlate_events(candidate_events)


async def persist_incident_clusters(
    clusters: List[IncidentCluster], session: Optional[AsyncSession] = None
) -> List[IncidentModel]:
    """
    Persists IncidentCluster objects as IncidentModel rows in PostgreSQL.
    """
    if not clusters:
        return []

    models = [_correlation_scaffold.to_incident_model(c) for c in clusters]

    if session is not None:
        session.add_all(models)
        await session.commit()
        return models

    async with AsyncSessionLocal() as db:
        db.add_all(models)
        await db.commit()
        return models
