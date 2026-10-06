import asyncio
import os
import sys
import uuid
import time
import argparse
import shutil
import subprocess
from datetime import datetime, timezone, timedelta

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from sqlalchemy import text
from backend.app.core.database import AsyncSessionLocal, init_db
from backend.app.pipeline.collector import ingest_log_event, SYNTHETIC_SCENARIOS
from backend.app.pipeline.anomaly_filter import score_anomaly
from backend.app.pipeline.correlation import correlate_events
from backend.app.pipeline.llm_analysis import analyze_root_cause
from backend.app.models.entities import (
    LogEventModel, AnomalyScoreModel, IncidentModel, EvidenceModel, TroubleshootingSuggestionModel
)
from backend.app.models.schemas import ContextPayload, IncidentEventSummary


async def clear_database():
    """Wipes all log events, anomaly scores, incidents, and suggestions from database."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🧹 Resetting database tables...")
    async with AsyncSessionLocal() as session:
        await session.execute(text("DELETE FROM evidence;"))
        await session.execute(text("DELETE FROM troubleshooting_suggestions;"))
        await session.execute(text("DELETE FROM incidents;"))
        await session.execute(text("DELETE FROM anomaly_scores;"))
        await session.execute(text("DELETE FROM log_events;"))
        await session.commit()
    print("✅ Database cleanly reset! Dashboard now displays 0 logs, 0 anomalies, 0 incidents.\n")


async def stream_live_incident_cascade(
    scenario_name: str,
    host: str = "linux-prod-node01",
    delay_per_line: float = 0.15,
    include_background_noise: bool = True
):
    """
    Streams realistic kernel & system telemetry in real-time into the live pipeline.
    Interleaves genuine normal background telemetry (cron, systemd, USB, networking, ACPI)
    with critical fault sequences to demonstrate Novelty Point 1: Context Reduction.
    """
    fault_lines = SYNTHETIC_SCENARIOS.get(scenario_name, SYNTHETIC_SCENARIOS["ext4_disk_corruption"])
    normal_pool = SYNTHETIC_SCENARIOS.get("normal_baseline", [])

    scenario_titles = {
        "ext4_disk_corruption": "BLOCK STORAGE & EXT4 FILESYSTEM DEGRADATION",
        "segfault_storm": "USERSPACE CRASH & REPEATED SEGMENTATION FAULT CASCADE",
        "oom_killer": "PHYSICAL MEMORY EXHAUSTION & KERNEL OOM-KILLER CASCADE",
        "thermal_throttling": "HARDWARE CPU THERMAL ZONE CRITICAL OVERHEAT & THROTTLING",
    }
    title = scenario_titles.get(scenario_name, scenario_name.upper())

    # Assemble realistic mixed telemetry sequence
    if include_background_noise and len(normal_pool) >= 20:
        pre_noise = normal_pool[:22]
        post_noise = normal_pool[22:34]
        stream_sequence = [(line, False) for line in pre_noise] + \
                          [(line, True) for line in fault_lines] + \
                          [(line, False) for line in post_noise]
    else:
        stream_sequence = [(line, True) for line in fault_lines]

    print("\n" + "=" * 80)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚡ [STAGE 1 & 2: TELEMETRY STREAM & ML FILTERING] {title}")
    print(f"  -> Host: {host} (Kernel ring buffer [dmesg] & systemd journal [journalctl])")
    print(f"  -> Total Telemetry Stream: {len(stream_sequence)} log events (Simulating live Linux production traffic)")
    print("=" * 80)

    now = datetime.now(timezone.utc)
    events = []
    anomaly_scores = []
    anomalous_events = []

    # Stream and score in real time
    for i, (line, is_fault_phase) in enumerate(stream_sequence):
        # Determine authentic Linux source
        if any(k in line for k in ["systemd", "cron", "sshd", "fstrim", "logind"]):
            source = "journalctl"
        else:
            source = "dmesg"

        event = ingest_log_event(
            raw_line=line,
            source=source,
            host=host,
            timestamp=now + timedelta(seconds=i * 2)
        )
        events.append(event)

        # Run Stage 2 Supervised ML Inference
        score_model = score_anomaly(event, update_state=False)
        score_model.log_event_id = event.id
        anomaly_scores.append(score_model)

        # Display live incoming log with real-time classification
        src_tag = f"[{source:<10}]"
        if score_model.is_anomalous:
            status_tag = f"\033[91m[CRITICAL ANOMALY]\033[0m (p={score_model.score:.3f})"
            anomalous_events.append(event)
        else:
            status_tag = f"\033[92m[NORMAL FILTERED]\033[0m  (p={score_model.score:.3f})"

        print(f"  {src_tag} {status_tag} {line[:80]}")
        await asyncio.sleep(delay_per_line)

    async with AsyncSessionLocal() as db:
        # Ingest events and scores into PostgreSQL
        db.add_all(events)
        await db.flush()
        db.add_all(anomaly_scores)
        await db.flush()

        reduction_ratio = round((1 - (len(anomalous_events) / len(events))) * 100, 2)
        print("\n" + "-" * 80)
        print(f"  ✓ Stage 2 Complete: Ingested {len(events)} events into database.")
        print(f"    - Benign Background Noise: {len(events) - len(anomalous_events)} events filtered out (p < 0.65)")
        print(f"    - Flagged Critical Anomalies: {len(anomalous_events)} events (p >= 0.65)")
        print(f"    - Context Reduction Ratio: {reduction_ratio}% noise filtered before LLM")
        print("-" * 80)

        if not anomalous_events:
            await db.commit()
            print("  -> Baseline verified normal. No incident cluster formed.")
            return

        # 3. Semantic-Temporal Event Correlation
        print("\n[STAGE 3: TEMPORAL & CAUSAL GRAPH CORRELATION]")
        print("  -> Executing Semantic-Temporal Graph Clustering (TF-IDF + BFS)...")
        clusters = correlate_events(anomalous_events, window_seconds=60.0, similarity_threshold=0.05)
        if not clusters:
            await db.commit()
            return

        cluster = clusters[0]
        print(f"  ✓ Formed Incident Cluster #{cluster.cluster_id} with {len(cluster.events)} correlated causal events")

        # 4. LLM Root Cause Analysis
        print("\n[STAGE 4: GROUNDED GENAI ROOT-CAUSE ANALYSIS (GEMINI)]")
        print("  -> Querying Google Generative AI via official API endpoint...")
        events_summary = [
            IncidentEventSummary(
                event_id=ev.id,
                timestamp=ev.timestamp.isoformat(),
                source=ev.source,
                template_id=ev.template_id,
                anomaly_score=0.96,
                raw_snippet=ev.raw_text
            ) for ev in cluster.events
        ]

        context = ContextPayload(
            cluster_id=cluster.cluster_id,
            time_window_start=events_summary[0].timestamp,
            time_window_end=events_summary[-1].timestamp,
            total_raw_logs_processed=len(events),
            anomalous_events_count=len(anomalous_events),
            correlated_events_count=len(cluster.events),
            reduction_ratio_pct=reduction_ratio,
            primary_suspect_subsystem="kernel",
            events=events_summary
        )

        start_time = time.time()
        analysis = await analyze_root_cause(context)
        elapsed = time.time() - start_time
        print(f"  ✓ Gemini diagnosis completed in {elapsed:.2f}s (Confidence: {analysis.confidence * 100:.1f}%)")

        # 5. Persist Incident & Evidence
        incident = IncidentModel(
            id=str(uuid.uuid4()),
            created_at=datetime.now(timezone.utc),
            status="active",
            root_cause_summary=analysis.cause,
            confidence=analysis.confidence,
            correlated_event_ids=[e.id for e in cluster.events],
        )
        db.add(incident)
        await db.flush()

        for ev in analysis.evidence:
            evidence_model = EvidenceModel(
                id=str(uuid.uuid4()),
                incident_id=incident.id,
                log_event_id=ev.log_event_id,
                explanation_snippet=ev.explanation_snippet,
            )
            db.add(evidence_model)

        for cmd in analysis.troubleshooting_commands:
            cmd_model = TroubleshootingSuggestionModel(
                id=str(uuid.uuid4()),
                incident_id=incident.id,
                command_text=cmd.command_text,
                rationale=cmd.rationale,
            )
            db.add(cmd_model)

        await db.commit()

        # Print Executive Summary Box
        print("\n" + "=" * 80)
        print("📊 TELEMETRY INGESTION & PIPELINE SUMMARY")
        print("=" * 80)
        print(f"  Total Raw Telemetry Logs Ingested:    {len(events)}")
        print(f"  Normal Benign Logs (p < 0.65):        {len(events) - len(anomalous_events)} ({reduction_ratio}% filtered noise)")
        print(f"  Critical Anomalous Events (p >= 0.65): {len(anomalous_events)}")
        print(f"  Context Reduction Ratio:              {reduction_ratio}%")
        print(f"  Correlated Incident Clusters Formed:  1")
        print(f"  Active Incident ID:                   {incident.id}")
        print(f"  Root Cause Summary:                   {analysis.cause[:90]}...")
        print(f"  Gemini Diagnostic Confidence:         {analysis.confidence * 100:.1f}%")
        print(f"  Evidence Citations Count:             {len(analysis.evidence)} causal events cited")
        print(f"  Remediation Commands Suggested:       {len(analysis.troubleshooting_commands)}")
        print("=" * 80)
        print(f"🌐 Dashboard Live: Visit http://localhost:3000 to inspect logs and incident analytics.\n")


async def stream_live_host_kernel(duration_seconds: int = 15):
    """
    Captures REAL live kernel log messages directly from the host operating system.
    Supports Linux (dmesg) and macOS (/usr/bin/log show).
    """
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 🛰️  [HOST-TELEMETRY] Listening to live kernel messages...")

    raw_lines = []
    is_mac = sys.platform == "darwin"

    if is_mac:
        print("  -> OS: macOS Darwin Kernel (Querying recent kernel stream via /usr/bin/log)...")
        try:
            cmd = ["/usr/bin/log", "show", "--predicate", "process == \"kernel\"", "--last", "30s", "--style", "syslog"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            for line in res.stdout.splitlines():
                stripped = line.strip()
                if stripped and "kernel:" in stripped and not stripped.startswith("Filtering"):
                    raw_lines.append(stripped)
        except Exception as e:
            print(f"  -> Error capturing live host logs: {e}")
    else:
        print("  -> OS: Linux Kernel (Querying kernel ring buffer via dmesg)...")
        try:
            cmd = ["dmesg", "-T"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
            for line in res.stdout.splitlines()[-40:]:
                if line.strip():
                    raw_lines.append(line.strip())
        except Exception as e:
            print(f"  -> Error executing dmesg: {e}")

    if not raw_lines:
        print("  -> No host kernel messages captured. Falling back to live simulation stream.")
        await stream_live_incident_cascade("ext4_disk_corruption")
        return

    sample = raw_lines[-15:]
    print(f"  -> Captured {len(sample)} live host kernel messages. Ingesting into pipeline...")

    events = []
    now = datetime.now(timezone.utc)
    for i, line in enumerate(sample):
        ev = ingest_log_event(line, source="dmesg", host="localhost", timestamp=now + timedelta(seconds=i))
        events.append(ev)
        print(f"     [dmesg] {line[:95]}")
        await asyncio.sleep(0.15)

    async with AsyncSessionLocal() as db:
        db.add_all(events)
        await db.flush()

        # Score with ML model
        anomaly_scores = []
        for ev in events:
            sc = score_anomaly(ev, update_state=False)
            sc.log_event_id = ev.id
            anomaly_scores.append(sc)

        db.add_all(anomaly_scores)
        await db.commit()
        print(f"✅ Ingested and scored {len(events)} live host kernel events in real time!\n")


async def main():
    parser = argparse.ArgumentParser(description="KernelLens AI — Live Real-Time Telemetry & Presentation Ingestion")
    parser.add_argument("--clear", action="store_true", help="Clear all database logs and reset dashboard to 0")
    parser.add_argument("--live-kernel", action="store_true", help="Capture live kernel events directly from host OS")
    parser.add_argument("--scenario", type=str, default="all", choices=["all", "storage", "memory", "segfault", "thermal"], help="Run specific scenario cascade")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay in seconds per streamed log line")
    args = parser.parse_args()

    await init_db()

    if args.clear:
        await clear_database()
        return

    if args.live_kernel:
        await stream_live_host_kernel()
        return

    scenario_map = {
        "storage": ["ext4_disk_corruption"],
        "memory": ["oom_killer"],
        "segfault": ["segfault_storm"],
        "thermal": ["thermal_throttling"],
        "all": ["ext4_disk_corruption", "segfault_storm", "oom_killer"],
    }

    scenarios = scenario_map.get(args.scenario, ["ext4_disk_corruption"])
    for sc in scenarios:
        await stream_live_incident_cascade(sc, delay_per_line=args.delay)


if __name__ == "__main__":
    asyncio.run(main())
