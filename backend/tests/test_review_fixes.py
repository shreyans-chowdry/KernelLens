"""
Regression tests for the Oct 2026 code-review fixes:
evidence grounding, analyze-endpoint errors, dmesg de-duplication,
portable timeline, synthetic timestamp ordering, import cycles,
and deterministic (clock-independent) feature extraction.
"""
import asyncio
import importlib
import subprocess
import sys
import time
from datetime import datetime, timezone

import pytest

from backend.app.models.schemas import (
    CommandSuggestion,
    ContextPayload,
    EvidenceItem,
    IncidentEventSummary,
    RootCauseAnalysisResult,
)
from backend.app.pipeline.llm_analysis import LLMRootCauseAnalyzer


def _context(event_ids):
    return ContextPayload(
        cluster_id="c1",
        time_window_start="",
        time_window_end="",
        total_raw_logs_processed=len(event_ids),
        anomalous_events_count=len(event_ids),
        correlated_events_count=len(event_ids),
        reduction_ratio_pct=0.0,
        primary_suspect_subsystem="kernel",
        events=[
            IncidentEventSummary(
                event_id=i, timestamp="", source="dmesg", anomaly_score=0.9,
                raw_snippet="EXT4-fs error (device sda1): deleted inode referenced",
            )
            for i in event_ids
        ],
    )


def _result(cited_ids):
    return RootCauseAnalysisResult(
        cause="Disk failure caused filesystem corruption",
        evidence=[EvidenceItem(log_event_id=i, explanation_snippet="x") for i in cited_ids],
        confidence=0.9,
        troubleshooting_commands=[CommandSuggestion(command_text="dmesg -T", rationale="r")],
    )


# --------------------------------------------------------------------------
# LLM evidence grounding
# --------------------------------------------------------------------------
def test_grounding_drops_hallucinated_ids():
    grounded = LLMRootCauseAnalyzer._ground_evidence(_result(["real", "made-up"]), _context(["real"]))
    assert [e.log_event_id for e in grounded.evidence] == ["real"]


def test_grounding_returns_none_when_nothing_valid():
    assert LLMRootCauseAnalyzer._ground_evidence(_result(["made-up"]), _context(["real"])) is None


@pytest.mark.asyncio
async def test_analyze_falls_back_when_llm_cites_only_unknown_ids(monkeypatch):
    from backend.app.pipeline import llm_analysis

    analyzer = LLMRootCauseAnalyzer()
    monkeypatch.setattr(llm_analysis.settings, "GEMINI_API_KEY", "test-key")

    async def fake_gemini(prompt, context):
        return _result(["hallucinated-id"])

    monkeypatch.setattr(analyzer, "_call_gemini_with_retry", fake_gemini)
    result = await analyzer.analyze(_context(["ev-1", "ev-2"]))
    assert {e.log_event_id for e in result.evidence} <= {"ev-1", "ev-2"}
    assert analyzer.last_engine == "Local fallback engine"


# --------------------------------------------------------------------------
# API: analyze an incident whose events no longer exist -> 400 (was 500)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_analyze_incident_with_missing_events_returns_400(async_client):
    res = await async_client.post("/api/v1/incidents", json={"correlated_event_ids": ["ghost-id"]})
    assert res.status_code == 201
    res = await async_client.post(f"/api/v1/incidents/{res.json()['id']}/analyze")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "EVENTS_NOT_FOUND"


@pytest.mark.asyncio
async def test_timeline_endpoint_works_on_sqlite(async_client):
    await async_client.post("/api/v1/incidents", json={})
    res = await async_client.get("/api/v1/analytics/timeline")
    assert res.status_code == 200
    body = res.json()
    assert body and all({"hour", "count"} <= row.keys() for row in body)


# --------------------------------------------------------------------------
# dmesg poller emits only new lines on each cycle
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dmesg_poller_does_not_repeat_lines(monkeypatch):
    from backend.app.pipeline import pollers

    buffer = [b"[    1.000000] usb 1-1: new device\n[    2.000000] eth0: Link is Up\n"]

    class FakeProc:
        async def communicate(self):
            return buffer[0], b""

    async def fake_exec(*args, **kwargs):
        return FakeProc()

    monkeypatch.setattr(pollers.asyncio, "create_subprocess_exec", fake_exec)
    poller = pollers.DmesgPoller()
    poller._available = True

    assert len(await poller.poll_once()) == 2
    assert len(await poller.poll_once()) == 0
    buffer[0] += b"[    3.500000] Out of memory: Killed process 42 (java)\n"
    new = await poller.poll_once()
    assert [e.raw_text for e in new] == ["[    3.500000] Out of memory: Killed process 42 (java)"]


# --------------------------------------------------------------------------
# Synthetic scenario events keep their order
# --------------------------------------------------------------------------
def test_synthetic_events_have_increasing_timestamps():
    from backend.app.pipeline.collector import generate_synthetic_events

    events = generate_synthetic_events("ext4_disk_corruption")
    stamps = [e.timestamp for e in events]
    assert stamps == sorted(stamps) and len(set(stamps)) == len(stamps)


# --------------------------------------------------------------------------
# ML modules import cleanly on their own (previously circular imports)
# --------------------------------------------------------------------------
@pytest.mark.parametrize("module", [
    "backend.app.ml",
    "backend.app.ml.train_classifier",
    "backend.app.ml.evaluate_classifier",
    "backend.app.ml.domain_adaptation",
])
def test_ml_modules_import_in_fresh_interpreter(module):
    proc = subprocess.run(
        [sys.executable, "-W", "ignore", "-c", f"import {module}"],
        capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 0, proc.stderr[-800:]


# --------------------------------------------------------------------------
# Feature extraction for untimestamped training samples is clock-independent
# --------------------------------------------------------------------------
def test_training_features_do_not_depend_on_wall_clock():
    from backend.app.ml.feature_extractor import LogFeatureExtractor
    from backend.app.ml.train_classifier import prepare_training_samples

    events, _ = prepare_training_samples()

    def numeric_features(pause):
        fx = LogFeatureExtractor()
        rows = []
        for e in events:
            rows.append(fx._extract_numerical_features(e, update_state=True))
            if pause:
                time.sleep(0.001)
        return rows

    assert numeric_features(pause=False) == numeric_features(pause=True)


# --------------------------------------------------------------------------
# Deployment: hosted Postgres URLs and the public-analysis rate limit
# --------------------------------------------------------------------------
@pytest.mark.parametrize("raw, expected", [
    ("postgres://u:p@host:5432/db", "postgresql+asyncpg://u:p@host:5432/db"),
    ("postgresql://u:p@host/db?sslmode=require", "postgresql+asyncpg://u:p@host/db?ssl=require"),
    ("postgresql://u:p@host/db?sslmode=require&channel_binding=require", "postgresql+asyncpg://u:p@host/db?ssl=require"),
    ("postgresql+asyncpg://u@localhost/db", "postgresql+asyncpg://u@localhost/db"),
    ("sqlite+aiosqlite:///./x.db", "sqlite+aiosqlite:///./x.db"),
])
def test_database_url_is_normalised_for_asyncpg(raw, expected):
    from backend.app.core.config import Settings

    assert Settings(DATABASE_URL=raw).DATABASE_URL == expected


def test_cors_origins_parsing():
    from backend.app.core.config import Settings

    s = Settings(CORS_ORIGINS="https://kernellens.vercel.app/, http://localhost:3000")
    assert s.cors_origins == ["https://kernellens.vercel.app", "http://localhost:3000"]
    assert Settings(CORS_ORIGINS="*").cors_origins == ["*"]


def test_analysis_rate_limit(monkeypatch):
    from fastapi import HTTPException
    from backend.app.api import incidents

    monkeypatch.setattr(incidents.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(incidents.settings, "ANALYZE_RATE_LIMIT_PER_MIN", 2)
    incidents._recent_analyses.clear()
    incidents._check_analysis_rate_limit()
    incidents._check_analysis_rate_limit()
    with pytest.raises(HTTPException) as exc:
        incidents._check_analysis_rate_limit()
    assert exc.value.status_code == 429
    incidents._recent_analyses.clear()
