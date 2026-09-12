import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone
from backend.app.core.database import init_db, AsyncSessionLocal
from backend.app.pipeline.pollers import DmesgPoller, JournalctlPoller
from backend.app.pipeline.persistence import LogPersistenceService, persist_log_event, persist_log_events_batch
from backend.app.pipeline.collector import ingest_log_event, generate_synthetic_events
from backend.app.models.entities import LogEventModel


@pytest.mark.asyncio
async def test_dmesg_poller_normalization():
    poller = DmesgPoller()
    line = "[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB, file-rss:412kB, shmem-rss:0kB"
    event = poller.normalize_line(line, host="worker-01")

    assert event.source == "dmesg"
    assert event.host == "worker-01"
    assert event.template_id.startswith("TPL_")
    assert event.parsed_fields["kernel_time"] == 4200.101450
    assert event.parsed_fields["log_level"] == "crit"


@pytest.mark.asyncio
async def test_journalctl_poller_json_normalization():
    poller = JournalctlPoller()
    raw_entry = {
        "__REALTIME_TIMESTAMP": "1726142400000000",
        "MESSAGE": "EXT4-fs (device sda1): Remounting filesystem read-only",
        "PRIORITY": "3",
        "_HOSTNAME": "k8s-node-alpha",
        "_SYSTEMD_UNIT": "systemd-journald.service",
        "_PID": "412",
        "_COMM": "kernel"
    }

    event = poller.normalize_json_entry(raw_entry)

    assert event.source == "journalctl"
    assert event.host == "k8s-node-alpha"
    assert event.template_id.startswith("TPL_")
    assert event.parsed_fields["subsystem"] == "systemd-journald.service"
    assert event.parsed_fields["extracted_params"]["systemd_pid"] == "412"


@pytest.mark.asyncio
async def test_postgres_persistence_single_and_batch():
    # 1. Initialize schema in database
    await init_db()

    # 2. Persist single LogEvent entity
    test_id = str(uuid.uuid4())
    event = LogEventModel(
        id=test_id,
        source="dmesg",
        raw_text="[ 100.200000] eth0: link up",
        timestamp=datetime.now(timezone.utc),
        template_id="TPL_TEST_LINK",
        parsed_fields={"subsystem": "net", "log_level": "info"},
        host="test-host",
    )
    saved = await persist_log_event(event)
    assert saved.id == test_id

    # 3. Persist batch of synthetic LogEvents
    batch_events = generate_synthetic_events("oom_killer", host="test-node")
    saved_batch = await persist_log_events_batch(batch_events)
    assert len(saved_batch) == len(batch_events)

    # 4. Query back from database and verify persistence
    recent = await LogPersistenceService.get_recent_events(limit=20)
    assert len(recent) >= len(batch_events) + 1
    recent_ids = [e.id for e in recent]
    assert test_id in recent_ids
