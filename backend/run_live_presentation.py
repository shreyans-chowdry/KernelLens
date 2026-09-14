import asyncio
import os
import sys
import uuid
import time
from datetime import datetime, timezone

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app.core.database import AsyncSessionLocal, init_db
from backend.app.pipeline.collector import generate_synthetic_events
from backend.app.pipeline.anomaly_filter import score_anomaly
from backend.app.pipeline.correlation import correlate_events
from backend.app.pipeline.llm_analysis import analyze_root_cause
from backend.app.models.entities import (
    LogEventModel, AnomalyScoreModel, IncidentModel, EvidenceModel, TroubleshootingSuggestionModel
)
from backend.app.models.schemas import ContextPayload, IncidentEventSummary

async def inject_live_scenario(scenario_name: str):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 🚀 INJECTING REALISTIC LOGHUB SCENARIO: {scenario_name.upper()}")
    async with AsyncSessionLocal() as db:
        # 1. Ingest
        print("  -> (1/4) Ingesting kernel events into pipeline...")
        events = generate_synthetic_events(scenario_name, host="lab-server-prod")
        db.add_all(events)
        await db.flush()
        time.sleep(1) # Dramatic pause for presentation
        
        # 2. Score Anomalies
        print("  -> (2/4) Running Machine Learning Anomaly Filter (Loghub domain-adapted)...")
        anomalous_events = []
        anomaly_scores = []
        for event in events:
            score_model = score_anomaly(event, update_state=False)
            score_model.log_event_id = event.id
            anomaly_scores.append(score_model)
            if score_model.is_anomalous:
                anomalous_events.append(event)
        
        db.add_all(anomaly_scores)
        await db.flush()
        print(f"     [Result] {len(anomalous_events)}/{len(events)} events flagged as critical anomalies.")
        time.sleep(1)
        
        # 3. Correlate
        print("  -> (3/4) Executing Semantic-Temporal Event Correlation...")
        clusters = correlate_events(anomalous_events, window_seconds=60.0, similarity_threshold=0.05)
        if not clusters:
            print("     [Warn] No clusters formed.")
            return
            
        cluster = clusters[0]
        print(f"     [Result] Grouped {len(cluster.events)} events into exactly 1 underlying incident.")
        time.sleep(1)
        
        # 4. LLM Analysis
        print("  -> (4/4) Calling Gemini API for Root Cause Analysis & Resolution Generation...")
        
        events_summary = [
            IncidentEventSummary(
                event_id=ev.id,
                timestamp=ev.timestamp.isoformat(),
                source=ev.source,
                template_id=ev.template_id,
                anomaly_score=0.98,
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
            reduction_ratio_pct=0.0,
            primary_suspect_subsystem="kernel",
            events=events_summary
        )
        
        start_time = time.time()
        analysis = await analyze_root_cause(context)
        elapsed = time.time() - start_time
        print(f"     [Result] Gemini returned analysis in {elapsed:.2f} seconds!")
        
        # 5. Persist the generated incident
        print("  -> Persisting incident to Database...")
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
        print(f"✅ DONE. Refresh your dashboard! Live Incident ID: {incident.id}\n")


async def main():
    await init_db()
    # Inject a couple of diverse scenarios to make the dashboard look active
    await inject_live_scenario("ext4_disk_corruption")
    await inject_live_scenario("segfault_storm")
    await inject_live_scenario("oom_killer")

if __name__ == "__main__":
    asyncio.run(main())
