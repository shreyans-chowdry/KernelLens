import pytest
from datetime import datetime, timezone, timedelta

from backend.app.pipeline.collector import ingest_log_event
from backend.app.pipeline.correlation import (
    correlate_events,
    correlate_events_temporal_only,
    SemanticTemporalCorrelator,
)


def test_illustrative_fault_scenario_from_report():
    """
    Replays the illustrative fault cascade from Section 3.2.2 of the Review 1 Report:
    (I/O error → EXT4 filesystem error → blocked process → service failure)

    Asserts that:
    1. All four cascading fault events land in the exact same incident cluster.
    2. An unrelated contemporaneous network failure event within the same window
       is isolated into a separate cluster due to semantic divergence.
    """
    base_time = datetime(2026, 9, 12, 10, 0, 0, tzinfo=timezone.utc)

    # 1. Disk I/O Error
    e1 = ingest_log_event(
        "[ 5120.401250] Buffer I/O error on dev sda1, logical block 5242880, async page read",
        source="dmesg",
        timestamp=base_time,
    )

    # 2. EXT4 Filesystem Error (5 seconds later)
    e2 = ingest_log_event(
        "[ 5120.401310] EXT4-fs error (device sda1): ext4_lookup:1841: inode #262145: comm worker: deleted inode referenced: 262146",
        source="dmesg",
        timestamp=base_time + timedelta(seconds=5),
    )

    # 3. Blocked Process / D-State (15 seconds later)
    e3 = ingest_log_event(
        "[ 5120.502100] INFO: task worker:1841 blocked for more than 120 seconds in state D on dev sda1. Not tainted",
        source="dmesg",
        timestamp=base_time + timedelta(seconds=20),
    )

    # 4. Service Failure (systemd timeout on the worker service)
    e4 = ingest_log_event(
        "[ 5120.610000] systemd[1]: app-worker.service: Main process 1841 timed out. Killing. Failed with result 'timeout'.",
        source="journalctl",
        timestamp=base_time + timedelta(seconds=35),
    )

    # 5. Unrelated contemporaneous event (Network link drop, injected in the middle at t = 10s)
    unrelated_net = ingest_log_event(
        "[ 5120.450000] eth1: Link is Down - carrier lost - network interface reset",
        source="dmesg",
        timestamp=base_time + timedelta(seconds=10),
    )

    all_events = [e1, e2, e3, e4, unrelated_net]

    # Run Real Semantic-Temporal Correlation Model
    clusters = correlate_events(all_events, window_seconds=60.0, similarity_threshold=0.15)

    # Find the cluster containing the primary I/O error
    storage_cluster = next((c for c in clusters if e1.id in c.event_ids), None)
    assert storage_cluster is not None, "Primary storage incident cluster was not formed"

    # Core report assertion: All four cascading fault events must land in the same cluster!
    assert e1.id in storage_cluster.event_ids, "Event 1 (I/O error) missing from cluster"
    assert e2.id in storage_cluster.event_ids, "Event 2 (EXT4 error) missing from cluster"
    assert e3.id in storage_cluster.event_ids, "Event 3 (Blocked process) missing from cluster"
    assert e4.id in storage_cluster.event_ids, "Event 4 (Service failure) missing from cluster"
    assert storage_cluster.event_count >= 4, f"Cluster expected at least 4 events, got {storage_cluster.event_count}"

    # Verify that the unrelated network event was NOT merged into the storage cluster
    assert unrelated_net.id not in storage_cluster.event_ids, (
        "Unrelated network event was mistakenly merged into storage cluster! "
        "Semantic similarity should have kept them isolated."
    )

    # Verify the network event forms its own isolated cluster
    net_cluster = next((c for c in clusters if unrelated_net.id in c.event_ids), None)
    assert net_cluster is not None
    assert net_cluster.cluster_id != storage_cluster.cluster_id
