import os
import uuid
import logging
from typing import List, Tuple, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import LogEventModel, AnomalyScoreModel
from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal
from backend.app.ml.classifier import (
    AnomalyClassifierPipeline,
    DEFAULT_MODEL_PATH,
    MODEL_VERSION_TAG,
)
from backend.app.ml.train_classifier import train_and_save_model

logger = logging.getLogger("kernellens.anomaly_filter")

# Keywords retained for legacy comparison testing
ANOMALY_KEYWORDS = [
    "error",
    "fail",
    "denied",
    "oom",
    "i/o error",
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
    Legacy Rule-Based Anomaly Filter (Kept for benchmark comparison against ML classifier).
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
        raw_text_lower = event.raw_text.lower()
        log_level = event.parsed_fields.get("log_level", "info") if event.parsed_fields else "info"
        matched_keywords = [kw for kw in ANOMALY_KEYWORDS if kw in raw_text_lower]
        score = 0.05

        if log_level in ["crit", "emerg", "alert"]:
            score = max(score, 0.95)
        elif log_level == "error":
            score = max(score, 0.85)
        elif log_level == "warning":
            score = max(score, 0.60)

        if any(k in raw_text_lower for k in ["oom", "out of memory", "panic"]):
            score = max(score, 0.98)
        elif any(k in raw_text_lower for k in ["i/o error", "segfault", "corrupt"]):
            score = max(score, 0.90)
        elif matched_keywords:
            keyword_score = min(0.70 + (len(matched_keywords) * 0.08), 0.92)
            score = max(score, keyword_score)

        is_anomalous = score >= self.threshold

        return AnomalyScoreModel(
            id=str(uuid.uuid4()),
            log_event_id=event.id,
            model_version=self.model_version,
            score=round(score, 4),
            is_anomalous=is_anomalous,
        )


class MLAnomalyFilter:
    """
    Production Anomaly Filter powered by Real Trained Machine Learning Classifier
    per Section 3.2.1 of the Review 1 Report.
    Operates on template TF-IDF, occurrence frequency, and time-since-last-occurrence features.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        threshold: float = settings.ANOMALY_THRESHOLD,
    ):
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self.threshold = threshold
        self.pipeline = self._load_or_train_pipeline()

    def _load_or_train_pipeline(self) -> AnomalyClassifierPipeline:
        if os.path.exists(self.model_path):
            try:
                logger.info(f"Loading trained ML anomaly classifier from {self.model_path}")
                return AnomalyClassifierPipeline.load(self.model_path)
            except Exception as e:
                logger.warning(f"Failed to load existing model ({e}); training fresh model...")

        logger.info("Training supervised Anomaly Classifier on Loghub benchmark...")
        train_and_save_model(self.model_path)
        return AnomalyClassifierPipeline.load(self.model_path)

    def score_anomaly(self, event: LogEventModel, update_state: bool = True) -> AnomalyScoreModel:
        """
        Core operation: score_anomaly(event) -> AnomalyScore
        Computes calibrated anomaly probability via the trained ML classifier.
        """
        prob = self.pipeline.predict_anomaly_prob(event, update_state=update_state)
        is_anomalous = prob >= self.threshold

        return AnomalyScoreModel(
            id=str(uuid.uuid4()),
            log_event_id=event.id,
            model_version=self.pipeline.version_tag,
            score=round(prob, 4),
            is_anomalous=is_anomalous,
        )

    def filter_anomalies(
        self, events: List[LogEventModel], threshold: Optional[float] = None
    ) -> List[Tuple[LogEventModel, AnomalyScoreModel]]:
        """Filter list of events returning only ML-detected anomalies."""
        th = threshold if threshold is not None else self.threshold
        anomalies: List[Tuple[LogEventModel, AnomalyScoreModel]] = []
        for event in events:
            score = self.score_anomaly(event, update_state=True)
            if score.score >= th:
                score.is_anomalous = True
                anomalies.append((event, score))
        return anomalies


# Global singleton instances
_ml_filter = MLAnomalyFilter()
_legacy_rule_filter = RuleBasedAnomalyFilterScaffold()


def score_anomaly(event: LogEventModel, update_state: bool = True) -> AnomalyScoreModel:
    """
    Core operation: score_anomaly(event) -> AnomalyScore
    Swapped in with the Real Trained Supervised ML Classifier per Section 3.2.1.
    """
    return _ml_filter.score_anomaly(event, update_state=update_state)


def score_anomaly_rule_based(event: LogEventModel) -> AnomalyScoreModel:
    """
    Legacy rule-based scoring interface (used for comparative benchmarks and evaluation).
    """
    return _legacy_rule_filter.score_anomaly(event)


def filter_anomalies(
    events: List[LogEventModel], threshold: Optional[float] = None
) -> List[Tuple[LogEventModel, AnomalyScoreModel]]:
    """
    Filters events using the trained ML classifier.
    """
    return _ml_filter.filter_anomalies(events, threshold=threshold)


async def persist_anomaly_scores(
    scores: List[AnomalyScoreModel], session: Optional[AsyncSession] = None
) -> List[AnomalyScoreModel]:
    """Persist anomaly scores to PostgreSQL."""
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
