import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.entities import LogEventModel
from backend.app.models.schemas import LogEventCreate, LogEventRead, ErrorEnvelope

router = APIRouter(prefix="/events", tags=["events"])


@router.post(
    "",
    response_model=LogEventRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorEnvelope},
        422: {"model": ErrorEnvelope}
    }
)
async def ingest_event(
    payload: LogEventCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Part [B] Endpoint: Ingest a parsed LogEvent.
    Persists normalized LogEvent record to the database.
    """
    if not payload.raw_text or not payload.raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMPTY_RAW_TEXT", "message": "Log raw_text cannot be empty"}
        )

    event_id = str(uuid.uuid4())
    event_time = payload.timestamp or datetime.now(timezone.utc)

    event_row = LogEventModel(
        id=event_id,
        source=payload.source,
        raw_text=payload.raw_text.strip(),
        timestamp=event_time,
        template_id=payload.template_id or "TMPL_default",
        parsed_fields=payload.parsed_fields or {},
        host=payload.host or "localhost"
    )
    db.add(event_row)
    await db.commit()
    await db.refresh(event_row)

    return LogEventRead.model_validate(event_row)


@router.get(
    "",
    response_model=List[LogEventRead]
)
async def list_events(
    limit: int = Query(50, ge=1, le=200),
    source: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Part [B] Endpoint: Query recent LogEvents.
    """
    stmt = (
        select(LogEventModel)
        .order_by(desc(LogEventModel.timestamp))
        .limit(limit)
    )

    if source:
        stmt = stmt.where(LogEventModel.source == source)

    res = await db.execute(stmt)
    rows = res.scalars().all()

    return [LogEventRead.model_validate(r) for r in rows]
