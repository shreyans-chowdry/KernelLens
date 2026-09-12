# =========================================================================
# THROWAWAY MVP SCAFFOLD — RULE-BASED ANOMALY FILTER
# 
# WARNING: This rule-based implementation is a temporary placeholder!
# Per Section 3 of our Review 1 report ("LLM-Driven Dynamic Kernel Log
# Root Cause Analyzer"), Anomaly Filtering MUST be a real trained ML
# model (classifier on kernel log vector representations).
#
# This temporary rule-based filter exists ONLY as an MVP scaffold to allow
# downstream pipeline stages (Temporal Correlation, Context Construction,
# LLM Root-Cause Analysis, Dashboard) to be developed and demoed end-to-end
# before the real trained ML model is finalized in Phase 2.
#
# DO NOT RETAIN THIS IN THE FINAL LAB EVALUATION OR FINAL PROJECT RELEASE.
# =========================================================================

import re
import uuid
from typing import List, Tuple, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import LogEventModel, AnomalyScoreModel
from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal

# Explicit keyword list required by user prompt
ANOMALY_KEYWORDS = [
    "error",
    "fail",
    "denied",
    "oom",
    "i/o error",
    # Additional kernel failure indicators for robust demonstration
    "out of memory",
    "panic",
    "segfault",
    "corrupt",
    "aborted",
    "throttled",
    "critical",
    "call trace",
    "kernel bug",
]

SCAFFOLD_MODEL_VERSION = "throwaway-rule-v0.1-scaffold"


class RuleBasedAnomalyFilterScaffold:
    """
    Temporary Throwaway MVP Scaffold for Anomaly Filtering.
    Flags events based on log level severity and specific failure keywords.
    """

    def __init__(
        self,
        threshold: float = settings.ANOMALY_THRESHOLD,
        model_version: str = SCAFFOLD_MODEL_VERSION,
    ):
        self.threshold = threshold
        self.model_version = model_version

    def score_anomaly(self, event: LogEventModel) -> AnomalyScoreModel:
        """
        Core operation: score_anomaly(event) -> AnomalyScore
        Computes a heuristic anomaly score [0.0, 1.0] for a LogEvent.
        """
        raw_text_lower = event.raw_text.lower()
        log_level = event.parsed_fields.get("log_level", "info") if event.parsed_fields else "info"

        matched_keywords = [kw for kw in ANOMALY_KEYWORDS if kw in raw_text_lower]
        score = 0.05  # baseline normal noise

        # 1. Evaluate log level severity
        if log_level in ["crit", "emerg", "alert"]:
            score = max(score, 0.95)
        elif log_level == "error":
            score = max(score, 0.85)
        elif log_level == "warning":
            score = max(score, 0.60)

        # 2. Evaluate keyword matches
        if any(k in raw_text_lower for k in ["oom", "out of memory", "panic"]):
            score = max(score, 0.98)
        elif any(k in raw_text_lower for k in ["i/o error", "segfault", "corrupt"]):
            score = max(score, 0.90)
        elif matched_keywords:
            # Scale score by number of matched keywords
            keyword_score = min(0.70 + (len(matched_keywords) * 0.08), 0.92)
            score = max(score, keyword_score)

        is_anomalous = score >= self.threshold

        anomaly_score = AnomalyScoreModel(
            id=str(uuid.uuid4()),
            log_event_id=event.id,
            model_version=self.model_version,
            score=round(score, 4),
            is_anomalous=is_anomalous,
        )
        return anomaly_score

    def score_events(self, events: List[LogEventModel]) -> List[AnomalyScoreModel]:
        """Score a list of events."""
        return [self.score_anomaly(e) for e in events]

    def filter_anomalous_events(
        self, events: List[LogEventModel]
    ) -> List[Tuple[LogEventModel, AnomalyScoreModel]]:
        """
        Filter a list of events, returning only those flagged as anomalous
        along with their corresponding AnomalyScoreModel entities.
        """
        anomalies: List[Tuple[LogEventModel, AnomalyScoreModel]] = []
        for event in events:
            score = self.score_anomaly(event)
            if score.is_anomalous:
                anomalies.append((event, score))
        return anomalies


# Global singleton instance for throwaway filter
_scaffold_filter = RuleBasedAnomalyFilterScaffold()


def score_anomaly(event: LogEventModel) -> AnomalyScoreModel:
    """
    Functional interface: score_anomaly(event) -> AnomalyScore
    (Throwaway MVP scaffold implementation)
    """
    return _scaffold_filter.score_anomaly(event)


def filter_anomalies(
    events: List[LogEventModel], threshold: float = settings.ANOMALY_THRESHOLD
) -> List[Tuple[LogEventModel, AnomalyScoreModel]]:
    """
    Functional interface to filter anomalous events using throwaway scaffold.
    """
    filter_instance = RuleBasedAnomalyFilterScaffold(threshold=threshold)
    return filter_instance.filter_anomalous_events(events)


async def persist_anomaly_scores(
    scores: List[AnomalyScoreModel], session: Optional[AsyncSession] = None
) -> List[AnomalyScoreModel]:
    """Persist anomaly scores to database."""
    if not scores:
        return []

    if session is not None:
        session.add_all(scores)
        await session.commit()
        return scores

    async with AsyncSessionLocal() as db:
        db.add_all(scores)
        await db.commit()
        return scores
