import os
import sys

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from typing import Dict, Any
from sklearn.model_selection import train_test_split

from datasets.loghub_labeled_dataset import LOGHUB_BENCHMARK_DATA
from backend.app.pipeline.parser import parse_log
from backend.app.ml.classifier import AnomalyClassifierPipeline, DEFAULT_MODEL_PATH


def prepare_training_samples():
    """
    Preprocesses raw Loghub benchmark records using the Drain3 log parser.
    """
    processed_events = []
    labels = []

    for item in LOGHUB_BENCHMARK_DATA:
        raw_text = item["raw"]
        label = item["label"]
        template_id, parsed_fields = parse_log(raw_text)

        event_dict = {
            "raw_text": raw_text,
            "template_id": template_id,
            "parsed_fields": parsed_fields,
            "dataset": item.get("dataset", "unknown"),
        }
        processed_events.append(event_dict)
        labels.append(label)

    return processed_events, labels


def train_and_save_model(model_save_path: str = DEFAULT_MODEL_PATH) -> Dict[str, Any]:
    """
    Executes training workflow on Loghub dataset and persists serialized artifact.
    """
    print(f"Loading {len(LOGHUB_BENCHMARK_DATA)} Loghub benchmark records (BGL, HDFS, Linux)...")
    events, labels = prepare_training_samples()

    # Stratified 80/20 train/test split
    train_events, val_events, train_labels, val_labels = train_test_split(
        events, labels, test_size=0.20, random_state=42, stratify=labels
    )

    print(f"Training Anomaly Classifier on {len(train_labels)} samples (evaluating on {len(val_labels)} validation samples)...")
    pipeline = AnomalyClassifierPipeline()
    metrics = pipeline.train(
        train_events=train_events,
        train_labels=train_labels,
        val_events=val_events,
        val_labels=val_labels,
    )

    print(f"Training complete! Evaluation Metrics:")
    for k, v in metrics.items():
        print(f"  - {k}: {v}")

    pipeline.save(model_save_path)
    print(f"Model saved successfully to: {model_save_path}")
    return metrics


if __name__ == "__main__":
    train_and_save_model()
