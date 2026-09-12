import pytest
import pytest_asyncio
from backend.app.core.database import init_db, AsyncSessionLocal
from backend.app.pipeline.collector import ingest_log_event, generate_synthetic_events, SYNTHETIC_SCENARIOS
from backend.app.models.entities import LogEventModel


@pytest.mark.asyncio
async def test_init_db():
    # Verify that database schema initializes properly without errors
    await init_db()


def test_ingest_log_event():
    raw_line = "[ 1205.882100] python3[18492]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6"
    event = ingest_log_event(raw_line, source="dmesg", host="worker-node-03")

    assert event.id is not None
    assert event.source == "dmesg"
    assert event.host == "worker-node-03"
    assert event.raw_text == raw_line
    assert event.template_id is not None
    assert event.parsed_fields["log_level"] == "error"


def test_generate_synthetic_events():
    for scenario in ["oom_killer", "ext4_disk_corruption", "segfault_storm", "thermal_throttling", "normal_baseline"]:
        events = generate_synthetic_events(scenario)
        assert len(events) == len(SYNTHETIC_SCENARIOS[scenario])
        assert all(isinstance(e, LogEventModel) for e in events)
        assert all(e.source == "synthetic" for e in events)
