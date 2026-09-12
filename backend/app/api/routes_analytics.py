"""
KernelLens AI — Analytics API Routes
GET /api/v1/analytics/pipeline  — Pipeline reduction ratio stats
GET /api/v1/analytics/timeline  — Incident count bucketed by hour
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.entities import LogEventModel, AnomalyScoreModel, IncidentModel

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/pipeline")
async def get_pipeline_stats(db: AsyncSession = Depends(get_db)):
    """
    Pipeline reduction ratio: total logs → anomalies → incidents.
    Demonstrates Novelty Point 1 — context reduction before LLM.
    """
    total_logs_q = await db.execute(select(func.count(LogEventModel.id)))
    total_logs = total_logs_q.scalar() or 0

    anomalies_q = await db.execute(
        select(func.count(AnomalyScoreModel.id)).where(
            AnomalyScoreModel.is_anomalous == True  # noqa: E712
        )
    )
    anomaly_count = anomalies_q.scalar() or 0

    incidents_q = await db.execute(select(func.count(IncidentModel.id)))
    incident_count = incidents_q.scalar() or 0

    active_q = await db.execute(
        select(func.count(IncidentModel.id)).where(IncidentModel.status == "active")
    )
    active_count = active_q.scalar() or 0

    resolved_q = await db.execute(
        select(func.count(IncidentModel.id)).where(IncidentModel.status == "resolved")
    )
    resolved_count = resolved_q.scalar() or 0

    # Reduction ratio: how much context the LLM sees vs raw logs
    reduction_ratio = 0.0
    if total_logs > 0:
        reduction_ratio = round((1 - (anomaly_count / total_logs)) * 100, 2)

    return {
        "total_logs": total_logs,
        "anomaly_count": anomaly_count,
        "incident_count": incident_count,
        "active_incidents": active_count,
        "resolved_incidents": resolved_count,
        "reduction_ratio_pct": reduction_ratio,
    }


@router.get("/timeline")
async def get_incident_timeline(db: AsyncSession = Depends(get_db)):
    """Incident count bucketed by hour for timeline charts."""
    query = (
        select(
            func.date_trunc("hour", IncidentModel.created_at).label("hour"),
            func.count(IncidentModel.id).label("count"),
        )
        .group_by("hour")
        .order_by("hour")
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {"hour": row.hour.isoformat() if row.hour else None, "count": row.count}
        for row in rows
    ]
