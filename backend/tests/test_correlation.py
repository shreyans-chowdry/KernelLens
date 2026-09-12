import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

from backend.app.core.database import init_db, AsyncSessionLocal
from backend.app.models.entities import LogEventModel, IncidentModel
from backend.app.pipeline.collector import ingest_log_event
from backend.app.pipeline.correlation import (
    correlate_events,
    persist_incident_clusters,
    IncidentCluster,
    TemporalCorrelationScaffold,
)


def test_correlate_events_within_30s_window():
    """
    Verify that candidate anomalies occurring within 30s bucket into the same incident.
    """
    base_time = datetime(2026, 9, 12, 12, 0, 0, tzinfo=timezone.utc)

    e1 = ingest_log_event(
        "[ 100.0] high memory pressure detected",
        source="dmesg",
        timestamp=base_time,
    )
    e2 = ingest_log_event(
        "[ 110.0] Out of memory: Killed process 101",
        source="dmesg",
        timestamp=base_time + timedelta(seconds=10),
    )
    e3 = ingest_log_event(
        "[ 125.0] systemd: service exited with code 9",
        source="journalctl",
        timestamp=base_time + timedelta(seconds=25),
    )

    clusters = correlate_events([e1, e2, e3], window_seconds=30.0)

    assert len(clusters) == 1
    cluster = clusters[0]
    assert cluster.event_count == 3
    assert cluster.duration_seconds == 25.0
    assert cluster.start_time == base_time
    assert cluster.end_time == base_time + timedelta(seconds=25)
    assert set(cluster.event_ids) == {e1.id, e2.id, e3.id}


def test_correlate_events_split_into_multiple_incidents():
    """
    Verify that candidate anomalies separated by > 30s split into separate incidents.
    """
    base_time = datetime(2026, 9, 12, 12, 0, 0, tzinfo=timezone.utc)

    # Incident 1 events (within 5s)
    e1 = ingest_log_event("[ 100.0] disk error dev sda", timestamp=base_time)
    e2 = ingest_log_event("[ 105.0] buffer I/O error", timestamp=base_time + timedelta(seconds=5))

    # Incident 2 events (60s after Incident 1)
    e3 = ingest_log_event("[ 165.0] OOM killer invoked", timestamp=base_time + timedelta(seconds=65))
    e4 = ingest_log_event("[ 170.0] process postgres killed", timestamp=base_time + timedelta(seconds=70))

    clusters = correlate_events([e1, e2, e3, e4], window_seconds=30.0)

    assert len(clusters) == 2
    assert clusters[0].event_count == 2
    assert set(clusters[0].event_ids) == {e1.id, e2.id}

    assert clusters[1].event_count == 2
    assert set(clusters[1].event_ids) == {e3.id, e4.id}


def test_correlate_empty_and_single_events():
    assert correlate_events([]) == []

    e = ingest_log_event("single event", timestamp=datetime.now(timezone.utc))
    clusters = correlate_events([e])
    assert len(clusters) == 1
    assert clusters[0].event_count == 1
    assert clusters[0].events[0].id == e.id


@pytest.mark.asyncio
async def test_persist_incident_clusters_to_postgres():
    await init_db()

    base_time = datetime(2026, 9, 12, 14, 0, 0, tzinfo=timezone.utc)
    e1 = ingest_log_event("[ 500.0] thermal throttle activated", timestamp=base_time)
    e2 = ingest_log_event("[ 515.0] CPU0 clock throttled", timestamp=base_time + timedelta(seconds=15))

    clusters = correlate_events([e1, e2], window_seconds=30.0)
    saved_incidents = await persist_incident_clusters(clusters)

    assert len(saved_incidents) == 1
    incident = saved_incidents[0]
    assert incident.status == "active"
    assert incident.correlated_event_ids == [e1.id, e2.id]

    # Verify query from PostgreSQL
    async with AsyncSessionLocal() as session:
        query = select(IncidentModel).where(IncidentModel.id == incident.id)
        res = await session.execute(query)
        fetched = res.scalar_one_or_none()
        assert fetched is not None
        assert fetched.correlated_event_ids == [e1.id, e2.id]
