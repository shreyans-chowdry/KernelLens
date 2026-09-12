import numpy as np
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Union
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
from scipy.sparse import hstack, csr_matrix

from backend.app.models.entities import LogEventModel
from backend.app.pipeline.parser import parse_log

SEVERITY_WEIGHTS = {
    "crit": 4.0,
    "emerg": 4.0,
    "alert": 4.0,
    "error": 3.0,
    "warning": 2.0,
    "info": 1.0,
    "debug": 0.0,
}


class LogFeatureExtractor:
    """
    Feature Extractor for Log Anomaly Detection per Section 3.2.1 of Review 1 Report.
    Combines:
    1. Parsed-template textual features (TF-IDF over Drain3 template strings)
    2. Frequency features (template occurrence counts and rolling frequency)
    3. Time-since-last-occurrence features (delta time between template recurrences)
    4. Severity and structural metadata (log level, extracted parameter count)
    """

    def __init__(self, max_tfidf_features: int = 128):
        self.max_tfidf_features = max_tfidf_features
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=max_tfidf_features,
            sublinear_tf=True,
            token_pattern=r"(?u)\b\w+\b|<[A-Z_]+>",
        )
        self.scaler = StandardScaler(with_mean=False)
        self.template_counts: Dict[str, int] = {}
        self.template_last_seen: Dict[str, datetime] = {}
        self.total_events_observed: int = 0
        self.is_fitted: bool = False

    def reset_streaming_state(self):
        """Reset online tracking dictionaries."""
        self.template_counts.clear()
        self.template_last_seen.clear()
        self.total_events_observed = 0

    def _extract_numerical_features(
        self,
        event: Union[LogEventModel, Dict[str, Any]],
        update_state: bool = True
    ) -> List[float]:
        """
        Extract frequency, time-since-last-occurrence, and severity features.
        """
        if isinstance(event, LogEventModel):
            template_id = event.template_id or "TPL_UNKNOWN"
            parsed_fields = event.parsed_fields or {}
            ts = event.timestamp or datetime.now(timezone.utc)
        else:
            template_id = event.get("template_id", "TPL_UNKNOWN")
            parsed_fields = event.get("parsed_fields", {})
            ts = event.get("timestamp", datetime.now(timezone.utc))

        log_level = parsed_fields.get("log_level", "info")
        severity_val = SEVERITY_WEIGHTS.get(log_level, 1.0)

        params = parsed_fields.get("extracted_params", {})
        param_count = sum(len(v) if isinstance(v, list) else 1 for v in params.values())

        # 1. Frequency feature
        current_count = self.template_counts.get(template_id, 0)
        freq_ratio = (current_count + 1) / max(1, self.total_events_observed + 1)

        # 2. Time-since-last-occurrence feature (in seconds)
        last_ts = self.template_last_seen.get(template_id)
        if last_ts is not None and ts is not None:
            time_since_last_sec = max(0.0, (ts - last_ts).total_seconds())
            is_novel = 0.0
        else:
            time_since_last_sec = 3600.0  # Sentinel for first occurrence / rare template
            is_novel = 1.0

        # Log scale of time since last occurrence
        time_feature = np.log1p(time_since_last_sec)

        # Update streaming state if requested
        if update_state:
            self.total_events_observed += 1
            self.template_counts[template_id] = current_count + 1
            if ts:
                self.template_last_seen[template_id] = ts

        return [
            float(np.log1p(current_count)),
            float(freq_ratio),
            float(time_feature),
            float(is_novel),
            float(severity_val),
            float(param_count),
        ]

    def _get_template_text(self, event: Union[LogEventModel, Dict[str, Any]]) -> str:
        if isinstance(event, LogEventModel):
            template_str = event.parsed_fields.get("template_str") if event.parsed_fields else None
            return template_str or event.raw_text
        else:
            parsed = event.get("parsed_fields", {})
            template_str = parsed.get("template_str") if parsed else None
            return template_str or event.get("raw_text", "")

    def fit(self, events: List[Union[LogEventModel, Dict[str, Any]]]):
        """Fit vectorizer and scaler on training events."""
        texts = [self._get_template_text(e) for e in events]
        self.vectorizer.fit(texts)

        # Extract numerical features for all events
        self.reset_streaming_state()
        num_feats = [self._extract_numerical_features(e, update_state=True) for e in events]
        num_arr = np.array(num_feats, dtype=np.float32)
        self.scaler.fit(num_arr)

        self.is_fitted = True
        return self

    def transform(
        self,
        events: List[Union[LogEventModel, Dict[str, Any]]],
        update_state: bool = True
    ) -> csr_matrix:
        """Transform events into composite sparse feature matrix."""
        if not self.is_fitted:
            raise RuntimeError("LogFeatureExtractor must be fitted before transforming.")

        texts = [self._get_template_text(e) for e in events]
        tfidf_mat = self.vectorizer.transform(texts)

        num_feats = [self._extract_numerical_features(e, update_state=update_state) for e in events]
        num_arr = np.array(num_feats, dtype=np.float32)
        scaled_num = self.scaler.transform(num_arr)
        num_sparse = csr_matrix(scaled_num)

        # Stack textual features with frequency, temporal, and severity features
        composite = hstack([tfidf_mat, num_sparse], format="csr")
        return composite

    def fit_transform(self, events: List[Union[LogEventModel, Dict[str, Any]]]) -> csr_matrix:
        self.fit(events)
        return self.transform(events, update_state=False)
