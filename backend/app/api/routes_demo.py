"""
KernelLens AI — Demo Seeding API Route
POST /api/v1/demo/seed — Populates the database with synthetic scenario data
for live dashboard demonstrations.
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.entities import (
    LogEventModel,
    AnomalyScoreModel,
    IncidentModel,
    EvidenceModel,
    TroubleshootingSuggestionModel,
)
from backend.app.pipeline.collector import generate_synthetic_events
from backend.app.pipeline.anomaly_filter import score_anomaly

router = APIRouter(prefix="/demo", tags=["Demo"])


# Predefined troubleshooting for each scenario type
SCENARIO_TROUBLESHOOTING = {
    "oom_killer": {
        "root_cause": (
            "Linux Out-of-Memory (OOM) Killer terminated process 'postgres' (PID 2841) "
            "due to critical memory exhaustion. The system's page allocator failed to "
            "satisfy a GFP_KERNEL allocation (order:2), indicating severe physical memory "
            "fragmentation. Total anonymous RSS was ~7.5 GB, which consumed nearly all "
            "available physical memory."
        ),
        "confidence": 0.94,
        "commands": [
            {"cmd": "dmesg -T | grep -i 'oom\\|killed\\|memory'", "rationale": "Review kernel OOM killer decisions and memory pressure events"},
            {"cmd": "free -h && cat /proc/meminfo", "rationale": "Check current memory utilization and available swap space"},
            {"cmd": "ps aux --sort=-%mem | head -20", "rationale": "Identify processes currently consuming the most memory"},
            {"cmd": "journalctl -u postgresql --since '1 hour ago'", "rationale": "Review PostgreSQL service status after OOM kill event"},
        ],
    },
    "ext4_disk_corruption": {
        "root_cause": (
            "EXT4 filesystem on /dev/sda1 encountered unrecoverable medium errors at "
            "sector 41943040, triggering a cascade: SCSI read failure → block I/O error → "
            "EXT4 inode corruption → journal abort → forced read-only remount. This indicates "
            "physical disk degradation or bad sectors that could not be reallocated."
        ),
        "confidence": 0.91,
        "commands": [
            {"cmd": "smartctl -a /dev/sda", "rationale": "Check S.M.A.R.T. disk health for reallocated sectors and pending errors"},
            {"cmd": "dmesg -T | grep -i 'error\\|sda\\|ext4\\|blk'", "rationale": "Review block device and filesystem error timeline"},
            {"cmd": "mount | grep sda1", "rationale": "Verify current mount status (read-only indicates active corruption)"},
            {"cmd": "fsck -n /dev/sda1", "rationale": "Dry-run filesystem check to assess extent of corruption (non-destructive)"},
        ],
    },
    "segfault_storm": {
        "root_cause": (
            "Repeated segmentation faults in python3 processes at consistent address "
            "0x7ffe00000000 (libc.so.6) suggest either a corrupted shared library, "
            "a memory-corrupting bug in a C extension module, or physical memory errors "
            "affecting the libc text region. The uniform fault address across multiple "
            "PIDs strongly indicates a shared-library or hardware origin."
        ),
        "confidence": 0.82,
        "commands": [
            {"cmd": "dmesg -T | grep -i 'segfault\\|traps\\|protection'", "rationale": "Review all segmentation fault entries and trap details"},
            {"cmd": "coredumpctl list --since today", "rationale": "List core dumps for stack trace analysis"},
            {"cmd": "ldd /usr/bin/python3 | grep libc", "rationale": "Verify libc shared library linkage integrity"},
            {"cmd": "memtester 256M 1", "rationale": "Quick memory test to rule out hardware RAM errors"},
        ],
    },
    "thermal_throttling": {
        "root_cause": (
            "CPU thermal zone 0 reached critical temperature (102°C), triggering emergency "
            "throttling across all 4 CPU cores (4118-4122 cumulative events). This is well "
            "above safe operating limits (typically 85-95°C) and indicates cooling system "
            "failure, blocked airflow, or excessive sustained workload."
        ),
        "confidence": 0.88,
        "commands": [
            {"cmd": "sensors", "rationale": "Read current CPU core temperatures from hardware sensors"},
            {"cmd": "cat /sys/class/thermal/thermal_zone*/temp", "rationale": "Read raw thermal zone readings from sysfs"},
            {"cmd": "turbostat --interval 2 --num_iterations 5", "rationale": "Monitor CPU frequency, C-states, and thermal throttling in real-time"},
            {"cmd": "journalctl -k --grep='thermal\\|throttl' --since '1 hour ago'", "rationale": "Review kernel thermal event history"},
        ],
    },
}


@router.post("/seed")
async def seed_demo_data(db: AsyncSession = Depends(get_db)):
    """
    Seed the database with synthetic kernel incident scenarios.
    Runs a mini pipeline: generate events → score anomalies → create incidents → attach evidence & commands.
    """
    seeded = {"scenarios": [], "total_events": 0, "total_incidents": 0}

    for scenario_name in ["oom_killer", "ext4_disk_corruption", "segfault_storm", "thermal_throttling"]:
        events = generate_synthetic_events(scenario_name, host="linux-lab-01")

        # Persist log events
        db.add_all(events)
        await db.flush()

        # Score anomalies
        anomaly_scores = []
        anomalous_events = []
        for event in events:
            score_model = score_anomaly(event, update_state=False)
            score_model.log_event_id = event.id
            anomaly_scores.append(score_model)
            if score_model.is_anomalous:
                anomalous_events.append(event)

        db.add_all(anomaly_scores)
        await db.flush()

        # Create incident
        troubleshooting = SCENARIO_TROUBLESHOOTING.get(scenario_name, {})
        incident = IncidentModel(
            id=str(uuid.uuid4()),
            created_at=events[0].timestamp if events else datetime.now(timezone.utc),
            status="active",
            root_cause_summary=troubleshooting.get("root_cause", f"Synthetic {scenario_name} incident"),
            confidence=troubleshooting.get("confidence", 0.5),
            correlated_event_ids=[e.id for e in events],
        )
        db.add(incident)
        await db.flush()

        # Add evidence items
        for event in anomalous_events[:5]:  # Limit to top 5 evidence items
            evidence = EvidenceModel(
                id=str(uuid.uuid4()),
                incident_id=incident.id,
                log_event_id=event.id,
                explanation_snippet=f"Anomalous kernel event detected: {event.raw_text[:120]}",
            )
            db.add(evidence)

        # Add troubleshooting commands
        for cmd_data in troubleshooting.get("commands", []):
            suggestion = TroubleshootingSuggestionModel(
                id=str(uuid.uuid4()),
                incident_id=incident.id,
                command_text=cmd_data["cmd"],
                rationale=cmd_data["rationale"],
            )
            db.add(suggestion)

        seeded["scenarios"].append(scenario_name)
        seeded["total_events"] += len(events)
        seeded["total_incidents"] += 1

    # Also seed normal baseline events (no incidents)
    normal_events = generate_synthetic_events("normal_baseline", host="linux-lab-01")
    db.add_all(normal_events)
    seeded["total_events"] += len(normal_events)

    await db.commit()

    return {
        "message": "Demo data seeded successfully",
        "details": seeded,
    }
