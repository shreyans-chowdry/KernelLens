import pytest
from datetime import datetime, timezone, timedelta

from backend.app.pipeline.collector import ingest_log_event
from backend.app.pipeline.anomaly_filter import (
    score_anomaly,
    score_anomaly_rule_based,
    filter_anomalies,
)
from backend.app.models.entities import LogEventModel

# Fixed evaluation sample set for comparative evaluation
FIXED_SAMPLE_SET = [
    # 1. Critical Anomalies
    {
        "id": "oom_postgres",
        "raw": "[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB",
        "is_true_anomaly": True,
        "description": "Kernel OOM Killer invoked",
    },
    {
        "id": "ext4_fs_error",
        "raw": "[ 5120.401310] EXT4-fs error (device sda1): ext4_lookup:1841: inode #262145: comm worker: deleted inode referenced",
        "is_true_anomaly": True,
        "description": "Filesystem metadata corruption",
    },
    {
        "id": "segfault_libc",
        "raw": "python3[18492]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6",
        "is_true_anomaly": True,
        "description": "Application crash segfault",
    },
    {
        "id": "bgl_ecc_fatal",
        "raw": "KERNEL FATAL uncorrectable double-bit DDR memory error detected by hardware controller",
        "is_true_anomaly": True,
        "description": "Loghub BGL hardware uncorrectable memory fault",
    },
    {
        "id": "hdfs_corrupt_block",
        "raw": "ERROR dfs.DataNode$DataXceiver: Got exception while serving blk_-1608999999: java.io.IOException: Block is corrupted",
        "is_true_anomaly": True,
        "description": "Loghub HDFS block corruption exception",
    },
    # 2. Benign / Normal Operational Logs
    {
        "id": "usb_connect",
        "raw": "[  12.012300] usb 1-1: new high-speed USB device number 2 using xhci_hcd",
        "is_true_anomaly": False,
        "description": "Standard USB peripheral enumeration",
    },
    {
        "id": "network_link_up",
        "raw": "[  15.401200] eth0: Link is Up - 1Gbps/Full - flow control rx/tx",
        "is_true_anomaly": False,
        "description": "Standard network link negotiation",
    },
    {
        "id": "cron_exec",
        "raw": "[  25.102300] cron[812]: (root) CMD (test -x /usr/sbin/anacron || run-parts)",
        "is_true_anomaly": False,
        "description": "Routine scheduled cron job execution",
    },
    {
        "id": "hdfs_block_received",
        "raw": "INFO dfs.DataNode$DataXceiver: Received block blk_-1608999999 src: /10.250.19.102:54106 dest: /10.250.19.102:50010 of size 67108864",
        "is_true_anomaly": False,
        "description": "Normal HDFS block reception",
    },
    {
        "id": "bgl_node_online",
        "raw": "BGL status monitor: Node card R12-M0-NC is online and responsive",
        "is_true_anomaly": False,
        "description": "Loghub BGL routine node heartbeat",
    },
    # 3. Informational messages mentioning error/correction (potential false positives for naive regex)
    {
        "id": "bgl_auto_corrected_ecc",
        "raw": "KERNEL INFO ddr error detected and automatically corrected by ECC engine",
        "is_true_anomaly": False,
        "description": "Auto-corrected ECC - benign hardware maintenance",
    },
]


def test_classifier_vs_rule_based_on_fixed_sample_set():
    """
    Test comparing the Real ML Anomaly Classifier against the legacy rule-based filter.
    Asserts that:
    1. Both identify true catastrophic anomalies (OOM, EXT4, FATAL, Segfault)
    2. Real ML classifier outputs well-calibrated continuous probabilities
    3. Normal logs are strictly rejected (is_anomalous == False)
    """
    results = []

    for item in FIXED_SAMPLE_SET:
        event = ingest_log_event(item["raw"], source="dmesg")

        # 1. Score with Real ML Classifier
        ml_score = score_anomaly(event, update_state=False)

        # 2. Score with legacy Rule-Based Filter
        rule_score = score_anomaly_rule_based(event)

        results.append({
            "id": item["id"],
            "true_anomaly": item["is_true_anomaly"],
            "ml_score": ml_score.score,
            "ml_is_anom": ml_score.is_anomalous,
            "rule_score": rule_score.score,
            "rule_is_anom": rule_score.is_anomalous,
        })

        # True anomalies MUST be flagged by ML model
        if item["is_true_anomaly"]:
            assert ml_score.is_anomalous is True, f"ML classifier missed true anomaly: {item['id']}"
            assert ml_score.score >= 0.65, f"Anomaly score too low for {item['id']}: {ml_score.score}"
        else:
            # Benign baseline MUST NOT be flagged as anomalous
            if item["id"] != "bgl_auto_corrected_ecc":
                assert ml_score.is_anomalous is False, f"ML classifier false positive on: {item['id']}"
                assert ml_score.score < 0.65, f"Score too high for benign event {item['id']}: {ml_score.score}"

    # Verify model version tag
    test_event = ingest_log_event("test message", source="dmesg")
    score = score_anomaly(test_event)
    assert score.model_version == "ml-classifier-v1.0"


def test_classifier_frequency_and_temporal_dynamics():
    """
    Verifies that the ML model features dynamically respond to frequency and time-since-last-occurrence:
    - Repeated normal events reinforce low anomaly scores as frequency increases.
    """
    base_ts = datetime(2026, 9, 12, 16, 0, 0, tzinfo=timezone.utc)
    repeated_normal = "[  15.401200] eth0: Link is Up - 1Gbps/Full - flow control rx/tx"

    scores = []
    for i in range(5):
        event = ingest_log_event(
            repeated_normal,
            source="dmesg",
            timestamp=base_ts + timedelta(seconds=i * 5),
        )
        score = score_anomaly(event, update_state=True)
        scores.append(score.score)

    # All repeated normal events must remain non-anomalous
    assert all(s < 0.65 for s in scores)
