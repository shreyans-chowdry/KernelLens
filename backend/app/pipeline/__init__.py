"""KernelLens Pipeline Package"""
from backend.app.pipeline.parser import parse_log, KernelLogParser
from backend.app.pipeline.collector import ingest_log_event, LinuxLogCollector, generate_synthetic_events
from backend.app.pipeline.pollers import DmesgPoller, JournalctlPoller
from backend.app.pipeline.persistence import LogPersistenceService, persist_log_event, persist_log_events_batch
from backend.app.pipeline.anomaly_filter import (
    score_anomaly,
    filter_anomalies,
    persist_anomaly_scores,
    RuleBasedAnomalyFilterScaffold,
)
from backend.app.pipeline.correlation import (
    correlate_events,
    persist_incident_clusters,
    IncidentCluster,
    TemporalCorrelationScaffold,
)

__all__ = [
    "parse_log",
    "KernelLogParser",
    "ingest_log_event",
    "LinuxLogCollector",
    "generate_synthetic_events",
    "DmesgPoller",
    "JournalctlPoller",
    "LogPersistenceService",
    "persist_log_event",
    "persist_log_events_batch",
    "score_anomaly",
    "filter_anomalies",
    "persist_anomaly_scores",
    "RuleBasedAnomalyFilterScaffold",
    "correlate_events",
    "persist_incident_clusters",
    "IncidentCluster",
    "TemporalCorrelationScaffold",
]
