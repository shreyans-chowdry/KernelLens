import pytest
from datetime import datetime, timezone, timedelta
from typing import List
from httpx import AsyncClient

from backend.app.models.entities import (
    LogEventModel,
    AnomalyScoreModel,
    IncidentModel,
)
from backend.app.models.schemas import (
    ContextPayload,
    IncidentEventSummary,
    RootCauseAnalysisResult,
    CommandSuggestion,
    EvidenceItem,
)
from backend.app.pipeline.collector import ingest_log_event
from backend.app.pipeline.parser import parse_log
from backend.app.pipeline.anomaly_filter import (
    score_anomaly,
    filter_anomalies,
    persist_anomaly_scores,
)
from backend.app.pipeline.correlation import (
    correlate_events,
    persist_incident_clusters,
    IncidentCluster,
)
from backend.app.pipeline.llm_analysis import analyze_root_cause


@pytest.mark.asyncio
async def test_end_to_end_phase1_workflow_direct():
    """
    Validates the complete 5-stage Phase 1 pipeline executed sequentially:
    Ingest → Filter (ML) → Correlate (ML) → Analyze (LLM) → Troubleshoot
    verifying contracts, data shapes, and behavior at every stage.
    """
    base_time = datetime(2026, 9, 12, 14, 0, 0, tzinfo=timezone.utc)

    # -------------------------------------------------------------
    # STAGE 1: INGEST & PARSE
    # -------------------------------------------------------------
    raw_logs = [
        # Normal baseline logs
        (
            "[ 1000.000000] usb 1-1: new high-speed USB device number 2 using xhci_hcd",
            "dmesg",
            base_time,
            False,
        ),
        (
            "[ 1000.050000] eth0: Link is Up - 1Gbps/Full - flow control rx/tx",
            "dmesg",
            base_time + timedelta(seconds=1),
            False,
        ),
        (
            "[ 1000.100000] cron[812]: (root) CMD (test -x /usr/sbin/anacron || run-parts)",
            "syslog",
            base_time + timedelta(seconds=2),
            False,
        ),
        # Cascade 1: Storage / Block I/O Failure Cascade
        (
            "[ 5120.401100] sd 0:0:0:0: [sda] tag#12 FAILED Result: hostbyte=DID_OK driverbyte=DRIVER_OK cmd_age=5s",
            "dmesg",
            base_time + timedelta(seconds=5),
            True,
        ),
        (
            "[ 5120.401250] Buffer I/O error on dev sda1, logical block 5242880, async page read",
            "dmesg",
            base_time + timedelta(seconds=8),
            True,
        ),
        (
            "[ 5120.401310] EXT4-fs error (device sda1): ext4_lookup:1841: inode #262145: comm worker: deleted inode referenced: 262146",
            "dmesg",
            base_time + timedelta(seconds=12),
            True,
        ),
        (
            "systemd[1]: app-worker.service: Main process 1841 timed out. Killing. Failed with result 'timeout'.",
            "journalctl",
            base_time + timedelta(seconds=25),
            True,
        ),
    ]

    ingested_events: List[LogEventModel] = []
    for line, source, ts, is_expected_anomaly in raw_logs:
        # Ingestion API contract check: returns LogEventModel
        event = ingest_log_event(line, source=source, host="db-node-01", timestamp=ts)
        assert isinstance(event, LogEventModel)
        assert event.id is not None
        assert event.template_id is not None
        assert event.raw_text == line
        assert event.source == source
        assert event.host == "db-node-01"
        assert event.timestamp == ts
        ingested_events.append(event)

    assert len(ingested_events) == 7

    # -------------------------------------------------------------
    # STAGE 2: ANOMALY FILTERING (SUPERVISED ML CLASSIFIER)
    # -------------------------------------------------------------
    scores: List[AnomalyScoreModel] = []
    for ev in ingested_events:
        score_res = score_anomaly(ev)
        # Verify AnomalyScoreModel API contract
        assert isinstance(score_res, AnomalyScoreModel)
        assert score_res.log_event_id == ev.id
        assert 0.0 <= score_res.score <= 1.0
        assert isinstance(score_res.is_anomalous, bool)
        assert score_res.model_version is not None
        scores.append(score_res)

    # Verify normal events receive low anomaly score (< 0.65) and abnormal receive high (>= 0.65)
    normal_scores = scores[:3]
    failure_scores = scores[3:]

    for s in normal_scores:
        assert s.score < 0.65, f"Normal event got unexpectedly high score: {s.score}"
        assert not s.is_anomalous

    for s in failure_scores:
        assert s.score >= 0.65, f"Failure event got unexpectedly low score: {s.score}"
        assert s.is_anomalous

    # Verify filter_anomalies function contract
    filtered_pairs = filter_anomalies(ingested_events, threshold=0.65)
    assert len(filtered_pairs) == 4, f"Expected 4 anomalous events, got {len(filtered_pairs)}"
    candidate_anomalies = [pair[0] for pair in filtered_pairs]

    # Verify log reduction ratio
    reduction_pct = ((len(ingested_events) - len(candidate_anomalies)) / len(ingested_events)) * 100
    assert reduction_pct > 40.0, "Expected significant volume reduction from anomaly filtering"

    # -------------------------------------------------------------
    # STAGE 3: EVENT CORRELATION (SEMANTIC-TEMPORAL ML MODEL)
    # -------------------------------------------------------------
    # Correlate candidate events
    clusters = correlate_events(
        candidate_anomalies,
        window_seconds=60.0,
        similarity_threshold=0.08,
    )

    assert isinstance(clusters, list)
    assert len(clusters) >= 1
    primary_cluster = clusters[0]
    assert isinstance(primary_cluster, IncidentCluster)
    assert primary_cluster.cluster_id.startswith("cluster_")
    assert primary_cluster.event_count == 4
    assert primary_cluster.duration_seconds >= 20.0

    # Assert that all 4 stages of the storage cascade are in the single incident cluster
    candidate_ids = {e.id for e in candidate_anomalies}
    assert set(primary_cluster.event_ids) == candidate_ids

    # -------------------------------------------------------------
    # STAGE 4: CONTEXT CONSTRUCTION & LLM ROOT CAUSE ANALYSIS
    # -------------------------------------------------------------
    # Build ContextPayload contract
    event_summaries = [
        IncidentEventSummary(
            event_id=ev.id,
            timestamp=ev.timestamp.isoformat() if ev.timestamp else "",
            source=ev.source,
            template_id=ev.template_id,
            anomaly_score=0.92,
            raw_snippet=ev.raw_text,
        )
        for ev in primary_cluster.events
    ]

    context = ContextPayload(
        cluster_id=primary_cluster.cluster_id,
        time_window_start=primary_cluster.start_time.isoformat(),
        time_window_end=primary_cluster.end_time.isoformat(),
        total_raw_logs_processed=len(ingested_events),
        anomalous_events_count=len(candidate_anomalies),
        correlated_events_count=primary_cluster.event_count,
        reduction_ratio_pct=reduction_pct,
        primary_suspect_subsystem="storage_io",
        events=event_summaries,
    )

    # Perform analysis
    analysis_result = await analyze_root_cause(context)

    # Verify RootCauseAnalysisResult contract
    assert isinstance(analysis_result, RootCauseAnalysisResult)
    assert isinstance(analysis_result.cause, str)
    assert len(analysis_result.cause) > 20
    assert "I/O" in analysis_result.cause or "storage" in analysis_result.cause.lower() or "ext4" in analysis_result.cause.lower()
    assert 0.0 <= analysis_result.confidence <= 1.0
    assert analysis_result.confidence > 0.8

    # Verify Evidence contract: must cite exact event IDs from input
    assert len(analysis_result.evidence) >= 1
    cited_ids = {item.log_event_id for item in analysis_result.evidence}
    assert cited_ids.issubset(candidate_ids), f"Evidence cited unknown IDs: {cited_ids - candidate_ids}"

    # -------------------------------------------------------------
    # STAGE 5: TROUBLESHOOTING GUIDANCE
    # -------------------------------------------------------------
    assert len(analysis_result.troubleshooting_commands) >= 1
    for cmd in analysis_result.troubleshooting_commands:
        assert isinstance(cmd, CommandSuggestion)
        assert len(cmd.command_text) > 0
        assert len(cmd.rationale) > 0
        # Guidance safety invariant: Commands should be diagnostic/read-only commands
        assert not cmd.command_text.startswith("rm -rf")
        assert not cmd.command_text.startswith("mkfs")


@pytest.mark.asyncio
async def test_end_to_end_oom_workflow_direct():
    """
    Validates the complete 5-stage pipeline for an Out-of-Memory (OOM) killer fault cascade.
    """
    base_time = datetime(2026, 9, 12, 15, 0, 0, tzinfo=timezone.utc)
    oom_logs = [
        "[ 4200.101230] systemd[1]: high memory pressure detected on cgroup /user.slice",
        "[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB",
        "systemd[1]: postgresql.service: Failed with result 'oom-kill'.",
    ]

    events = [
        ingest_log_event(line, source="dmesg", timestamp=base_time + timedelta(seconds=i * 2))
        for i, line in enumerate(oom_logs)
    ]

    # Score and filter
    anomalies = filter_anomalies(events, threshold=0.65)
    assert len(anomalies) >= 2

    # Correlate
    clusters = correlate_events([a[0] for a in anomalies], window_seconds=60.0)
    assert len(clusters) == 1
    cluster = clusters[0]

    # Analyze
    context = ContextPayload(
        cluster_id=cluster.cluster_id,
        time_window_start=cluster.start_time.isoformat(),
        time_window_end=cluster.end_time.isoformat(),
        total_raw_logs_processed=10,
        anomalous_events_count=len(anomalies),
        correlated_events_count=cluster.event_count,
        reduction_ratio_pct=70.0,
        primary_suspect_subsystem="memory",
        events=[
            IncidentEventSummary(
                event_id=e.id,
                timestamp=e.timestamp.isoformat(),
                source=e.source,
                template_id=e.template_id,
                anomaly_score=0.91,
                raw_snippet=e.raw_text,
            )
            for e in cluster.events
        ],
    )

    result = await analyze_root_cause(context)
    assert "memory" in result.cause.lower() or "oom" in result.cause.lower()
    assert result.confidence >= 0.85
    assert len(result.evidence) >= 1
    assert any("free -h" in cmd.command_text or "vmstat" in cmd.command_text for cmd in result.troubleshooting_commands)


@pytest.mark.asyncio
async def test_end_to_end_phase1_workflow_http_api(async_client: AsyncClient):
    """
    Validates that the external HTTP API contracts remain unchanged:
    POST /events → POST /incidents → POST /incidents/{id}/analyze → GET /incidents/{id}/troubleshooting
    """
    # 1. Ingest log events via API
    ev1_res = await async_client.post("/events", json={
        "source": "dmesg",
        "raw_text": "[ 8000.123456] blk_update_request: I/O error, dev sda, sector 1024",
        "host": "k8s-worker-03",
    })
    assert ev1_res.status_code == 201
    ev1_id = ev1_res.json()["id"]

    ev2_res = await async_client.post("/events", json={
        "source": "dmesg",
        "raw_text": "[ 8000.123500] EXT4-fs error (device sda1): ext4_lookup: deleted inode referenced",
        "host": "k8s-worker-03",
    })
    assert ev2_res.status_code == 201
    ev2_id = ev2_res.json()["id"]

    # 2. Create incident cluster candidate
    inc_res = await async_client.post("/incidents", json={
        "status": "active",
        "confidence": 0.0,
        "correlated_event_ids": [ev1_id, ev2_id],
    })
    assert inc_res.status_code == 201
    inc_id = inc_res.json()["id"]

    # 3. Trigger root cause analysis
    analyze_res = await async_client.post(f"/incidents/{inc_id}/analyze")
    assert analyze_res.status_code == 200
    detail = analyze_res.json()

    assert detail["id"] == inc_id
    assert detail["status"] == "active"
    assert detail["root_cause_summary"] is not None
    assert detail["confidence"] > 0.8
    assert len(detail["evidence_list"]) >= 1
    assert len(detail["troubleshooting_suggestions"]) >= 1

    # Check evidence citations
    assert any(e["log_event_id"] in [ev1_id, ev2_id] for e in detail["evidence_list"])

    # 4. Fetch troubleshooting guidance
    tb_res = await async_client.get(f"/incidents/{inc_id}/troubleshooting")
    assert tb_res.status_code == 200
    tb_list = tb_res.json()
    assert len(tb_list) >= 1
    for item in tb_list:
        assert "command_text" in item
        assert "rationale" in item
        assert len(item["command_text"]) > 0
