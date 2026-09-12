import os
import joblib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

from backend.app.ml.feature_extractor import LogFeatureExtractor
from backend.app.models.entities import LogEventModel
from backend.app.core.config import settings

DEFAULT_MODEL_PATH = os.path.join(settings.MODEL_STORAGE_DIR, "anomaly_classifier.joblib")
MODEL_VERSION_TAG = "ml-classifier-v1.0"


class AnomalyClassifierPipeline:
    """
    Supervised Machine Learning Pipeline for Log Anomaly Detection
    per Section 3.2.1 of the Review 1 Report.
    Uses Random Forest trained on template TF-IDF, frequency, and time-since-last-occurrence.
    """

    def __init__(
        self,
        model: Optional[RandomForestClassifier] = None,
        feature_extractor: Optional[LogFeatureExtractor] = None,
        version_tag: str = MODEL_VERSION_TAG,
    ):
        self.model = model or RandomForestClassifier(
            n_estimators=100,
            max_depth=12,
            min_samples_split=2,
            random_state=42,
            class_weight="balanced",
        )
        self.feature_extractor = feature_extractor or LogFeatureExtractor(max_tfidf_features=128)
        self.version_tag = version_tag
        self.metrics: Dict[str, float] = {}
        self.trained_at: Optional[datetime] = None

    def train(
        self,
        train_events: List[Dict[str, Any]],
        train_labels: List[int],
        val_events: Optional[List[Dict[str, Any]]] = None,
        val_labels: Optional[List[int]] = None,
    ) -> Dict[str, float]:
        """
        Train the feature extractor and supervised classifier on labeled data.
        """
        X_train = self.feature_extractor.fit_transform(train_events)
        self.model.fit(X_train, train_labels)
        self.trained_at = datetime.now(timezone.utc)

        eval_events = val_events or train_events
        eval_labels = val_labels or train_labels

        X_eval = self.feature_extractor.transform(eval_events, update_state=False)
        preds = self.model.predict(X_eval)
        probs = self.model.predict_proba(X_eval)[:, 1]

        self.metrics = {
            "accuracy": float(accuracy_score(eval_labels, preds)),
            "precision": float(precision_score(eval_labels, preds, zero_division=0)),
            "recall": float(recall_score(eval_labels, preds, zero_division=0)),
            "f1": float(f1_score(eval_labels, preds, zero_division=0)),
            "roc_auc": float(roc_auc_score(eval_labels, probs)) if len(set(eval_labels)) > 1 else 1.0,
            "training_samples": len(train_labels),
        }
        return self.metrics

    def predict_anomaly_prob(self, event: LogEventModel, update_state: bool = True) -> float:
        """
        Computes anomaly probability [0.0, 1.0] for a single LogEventModel.
        """
        X = self.feature_extractor.transform([event], update_state=update_state)
        prob = self.model.predict_proba(X)[0][1]
        return float(prob)

    def predict_anomaly_probs_batch(
        self, events: List[LogEventModel], update_state: bool = True
    ) -> List[float]:
        """
        Computes anomaly probabilities for a batch of LogEventModel entities.
        """
        if not events:
            return []
        X = self.feature_extractor.transform(events, update_state=update_state)
        probs = self.model.predict_proba(X)[:, 1]
        return [float(p) for p in probs]

    def save(self, filepath: Optional[str] = None):
        """Serialize pipeline and weights to disk."""
        target_path = filepath or DEFAULT_MODEL_PATH
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        payload = {
            "model": self.model,
            "feature_extractor": self.feature_extractor,
            "version_tag": self.version_tag,
            "metrics": self.metrics,
            "trained_at": self.trained_at,
        }
        joblib.dump(payload, target_path)

    @classmethod
    def load(cls, filepath: Optional[str] = None) -> "AnomalyClassifierPipeline":
        """Load trained pipeline from disk."""
        target_path = filepath or DEFAULT_MODEL_PATH
        if not os.path.exists(target_path):
            raise FileNotFoundError(f"Model artifact not found at {target_path}")

        payload = joblib.load(target_path)
        instance = cls(
            model=payload["model"],
            feature_extractor=payload["feature_extractor"],
            version_tag=payload["version_tag"],
        )
        instance.metrics = payload.get("metrics", {})
        instance.trained_at = payload.get("trained_at")
        return instance
