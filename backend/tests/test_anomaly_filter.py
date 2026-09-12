import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy import select

from backend.app.core.database import init_db, AsyncSessionLocal
from backend.app.pipeline.collector import ingest_log_event, generate_synthetic_events
from backend.app.pipeline.persistence import persist_log_event
from backend.app.pipeline.anomaly_filter import (
    score_anomaly,
    filter_anomalies,
    persist_anomaly_scores,
    RuleBasedAnomalyFilterScaffold,
)
from backend.app.models.entities import LogEventModel, AnomalyScoreModel


def test_score_oom_event():
    line = "[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB"
    event = ingest_log_event(line, source="dmesg")
    score = score_anomaly(event)

    assert score.is_anomalous is True
    assert score.score >= 0.90
    assert score.model_version == "throwaway-rule-v0.1-scaffold"
    assert score.log_event_id == event.id


def test_score_io_error_event():
    line = "[ 5120.401250] Buffer I/O error on dev sda1, logical block 5242880, async page read"
    event = ingest_log_event(line, source="dmesg")
    score = score_anomaly(event)

    assert score.is_anomalous is True
    assert score.score >= 0.80


def test_score_denied_and_fail_keywords():
    lines = [
        "apparmor=\"DENIED\" operation=\"open\" profile=\"/usr/bin/daemon\" name=\"/etc/shadow\"",
        "systemd[1]: service-worker.service: Failed with result 'exit-code'.",
    ]
    for line in lines:
        event = ingest_log_event(line, source="journalctl")
        score = score_anomaly(event)
        assert score.is_anomalous is True
        assert score.score >= 0.65


def test_score_normal_baseline_events():
    normal_lines = [
        "[  12.012300] usb 1-1: new high-speed USB device number 2 using xhci_hcd",
        "[  15.401200] eth0: Link is Up - 1Gbps/Full - flow control rx/tx",
        "[  25.102300] cron[812]: (root) CMD (test -x /usr/sbin/anacron || run-parts)",
    ]
    for line in normal_lines:
        event = ingest_log_event(line, source="dmesg")
        score = score_anomaly(event)
        assert score.is_anomalous is False
        assert score.score < 0.65


def test_filter_anomalies_reduces_log_volume():
    """
    Verify that filter_anomalies reduces a mixed log stream, discarding baseline noise.
    """
    normal_events = generate_synthetic_events("normal_baseline")
    oom_events = generate_synthetic_events("oom_killer")
    mixed_stream = normal_events + oom_events

    anomalies = filter_anomalies(mixed_stream, threshold=0.65)

    # All normal events should be filtered out
    assert len(anomalies) < len(mixed_stream)
    assert len(anomalies) >= 4  # OOM failure lines
    for event, score in anomalies:
        assert score.is_anomalous is True
        assert any(kw in event.raw_text.lower() for kw in ["oom", "memory", "fail", "kill", "crit"])


@pytest.mark.asyncio
async def test_persist_anomaly_scores_to_postgres():
    await init_db()

    # 1. Create and persist parent LogEvent
    log_event = ingest_log_event(
        "[ 9999.00] kernel: ext4 I/O error on device sda", source="dmesg"
    )
    await persist_log_event(log_event)

    # 2. Score anomaly and persist AnomalyScore
    anomaly_score = score_anomaly(log_event)
    saved_scores = await persist_anomaly_scores([anomaly_score])

    assert len(saved_scores) == 1
    assert saved_scores[0].id == anomaly_score.id
    assert saved_scores[0].is_anomalous is True

    # 3. Query back from PostgreSQL
    async with AsyncSessionLocal() as session:
        query = select(AnomalyScoreModel).where(AnomalyScoreModel.id == anomaly_score.id)
        result = await session.execute(query)
        fetched = result.scalar_one_or_none()
        assert fetched is not None
        assert fetched.score == anomaly_score.score
        assert fetched.log_event_id == log_event.id
