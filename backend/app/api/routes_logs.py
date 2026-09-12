"""
KernelLens AI — Log Events API Routes
GET /api/v1/logs          — Paginated log events (newest first)
GET /api/v1/logs/stats    — Summary statistics
GET /api/v1/logs/{id}     — Single log event detail
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.entities import LogEventModel, AnomalyScoreModel
from backend.app.models.schemas import LogEventRead, AnomalyScoreRead

router = APIRouter(prefix="/logs", tags=["Logs"])


@router.get("/stats")
async def get_log_stats(db: AsyncSession = Depends(get_db)):
    """Summary statistics: total logs, anomaly count, source breakdown."""
    total_q = await db.execute(select(func.count(LogEventModel.id)))
    total = total_q.scalar() or 0

    anomaly_q = await db.execute(
        select(func.count(AnomalyScoreModel.id)).where(
            AnomalyScoreModel.is_anomalous == True  # noqa: E712
        )
    )
    anomaly_count = anomaly_q.scalar() or 0

    # Source breakdown
    source_q = await db.execute(
        select(LogEventModel.source, func.count(LogEventModel.id)).group_by(
            LogEventModel.source
        )
    )
    sources = {row[0]: row[1] for row in source_q.all()}

    return {
        "total_logs": total,
        "anomaly_count": anomaly_count,
        "sources": sources,
    }


@router.get("", response_model=List[LogEventRead])
async def list_logs(
    source: Optional[str] = Query(None, description="Filter by source (dmesg, journalctl, file, synthetic)"),
    host: Optional[str] = Query(None, description="Filter by host"),
    is_anomalous: Optional[bool] = Query(None, description="Filter by anomaly status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Paginated log events, newest first."""
    query = select(LogEventModel).order_by(desc(LogEventModel.timestamp))

    if source:
        query = query.where(LogEventModel.source == source)
    if host:
        query = query.where(LogEventModel.host == host)
    if is_anomalous is not None:
        query = query.join(AnomalyScoreModel).where(
            AnomalyScoreModel.is_anomalous == is_anomalous
        )

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    events = result.scalars().all()
    return events


@router.get("/{log_id}")
async def get_log_detail(log_id: str, db: AsyncSession = Depends(get_db)):
    """Single log event with its anomaly scores."""
    query = (
        select(LogEventModel)
        .options(selectinload(LogEventModel.anomaly_scores))
        .where(LogEventModel.id == log_id)
    )
    result = await db.execute(query)
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=404, detail="Log event not found")

    return {
        "id": event.id,
        "source": event.source,
        "raw_text": event.raw_text,
        "timestamp": event.timestamp.isoformat(),
        "template_id": event.template_id,
        "parsed_fields": event.parsed_fields,
        "host": event.host,
        "anomaly_scores": [
            {
                "id": s.id,
                "model_version": s.model_version,
                "score": s.score,
                "is_anomalous": s.is_anomalous,
            }
            for s in event.anomaly_scores
        ],
    }
