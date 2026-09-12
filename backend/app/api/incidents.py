import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.entities import (
    IncidentModel,
    EvidenceModel,
    TroubleshootingSuggestionModel,
    LogEventModel,
)
from backend.app.models.schemas import (
    IncidentCreate,
    IncidentRead,
    IncidentDetailRead,
    EvidenceRead,
    TroubleshootingSuggestionRead,
    LogEventRead,
    ContextPayload,
    IncidentEventSummary,
    ErrorEnvelope,
)
from backend.app.pipeline.llm_analysis import analyze_root_cause

router = APIRouter(prefix="/incidents", tags=["incidents"])


async def _load_incident(incident_id: str, db: AsyncSession) -> Optional[IncidentModel]:
    stmt = (
        select(IncidentModel)
        .where(IncidentModel.id == incident_id)
        .options(
            selectinload(IncidentModel.evidence_list),
            selectinload(IncidentModel.troubleshooting_suggestions),
        )
        .execution_options(populate_existing=True)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


@router.post(
    "",
    response_model=IncidentRead,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorEnvelope}},
)
async def create_incident(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Part [B] Endpoint: Ingest/create an incident cluster candidate.
    """
    new_id = str(uuid.uuid4())
    row = IncidentModel(
        id=new_id,
        created_at=datetime.now(timezone.utc),
        status=payload.status,
        root_cause_summary=payload.root_cause_summary,
        confidence=payload.confidence,
        correlated_event_ids=payload.correlated_event_ids or [],
    )
    db.add(row)
    await db.commit()

    loaded = await _load_incident(new_id, db)
    return IncidentRead.model_validate(loaded)


@router.get(
    "",
    response_model=List[IncidentRead],
    responses={400: {"model": ErrorEnvelope}},
)
async def list_incidents(
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(active|resolved)$"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Part [B] Endpoint: List active/resolved incidents ordered newest first.
    """
    stmt = (
        select(IncidentModel)
        .order_by(desc(IncidentModel.created_at))
        .limit(limit)
        .options(
            selectinload(IncidentModel.evidence_list),
            selectinload(IncidentModel.troubleshooting_suggestions),
        )
    )
    if status_filter:
        stmt = stmt.where(IncidentModel.status == status_filter)

    res = await db.execute(stmt)
    incidents = res.scalars().all()

    return [IncidentRead.model_validate(inc) for inc in incidents]


@router.get(
    "/{incident_id}",
    response_model=IncidentDetailRead,
    responses={404: {"model": ErrorEnvelope}},
)
async def get_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Part [B] Endpoint: Incident detail: evidence, cause, confidence, troubleshooting commands.
    """
    inc = await _load_incident(incident_id, db)
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INCIDENT_NOT_FOUND", "message": f"Incident '{incident_id}' not found"},
        )

    # Fetch associated LogEvent rows
    events = []
    if inc.correlated_event_ids:
        stmt_events = (
            select(LogEventModel)
            .where(LogEventModel.id.in_(inc.correlated_event_ids))
            .order_by(LogEventModel.timestamp.asc())
        )
        res_events = await db.execute(stmt_events)
        events = [LogEventRead.model_validate(e) for e in res_events.scalars().all()]

    return IncidentDetailRead(
        id=inc.id,
        created_at=inc.created_at,
        status=inc.status,
        root_cause_summary=inc.root_cause_summary,
        confidence=inc.confidence,
        correlated_event_ids=inc.correlated_event_ids or [],
        evidence_list=[EvidenceRead.model_validate(e) for e in inc.evidence_list],
        troubleshooting_suggestions=[
            TroubleshootingSuggestionRead.model_validate(s)
            for s in inc.troubleshooting_suggestions
        ],
        events=events,
    )


@router.post(
    "/{incident_id}/analyze",
    response_model=IncidentDetailRead,
    responses={
        404: {"model": ErrorEnvelope},
        400: {"model": ErrorEnvelope},
    },
)
async def trigger_analysis(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Part [B] Endpoint: Trigger LLM root-cause analysis stage.
    Constructs correlated ContextPayload, calls LLM analyzer with retry/validation,
    persists evidence items and troubleshooting suggestions, and returns updated incident.
    """
    inc = await _load_incident(incident_id, db)
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INCIDENT_NOT_FOUND", "message": f"Incident '{incident_id}' not found"},
        )

    if not inc.correlated_event_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMPTY_INCIDENT", "message": "Incident has no correlated events to analyze"},
        )

    # Fetch correlated events from database
    stmt_events = (
        select(LogEventModel)
        .where(LogEventModel.id.in_(inc.correlated_event_ids))
        .order_by(LogEventModel.timestamp.asc())
    )
    res_events = await db.execute(stmt_events)
    ev_rows = res_events.scalars().all()

    # Build ContextPayload
    events_summary = [
        IncidentEventSummary(
            event_id=ev.id,
            timestamp=ev.timestamp.isoformat() if ev.timestamp else "",
            source=ev.source,
            template_id=ev.template_id,
            anomaly_score=0.9,
            raw_snippet=ev.raw_text[:280] if len(ev.raw_text) > 280 else ev.raw_text,
        )
        for ev in ev_rows
    ]

    time_start = events_summary[0].timestamp if events_summary else ""
    time_end = events_summary[-1].timestamp if events_summary else ""

    context = ContextPayload(
        cluster_id=f"cluster_{incident_id[:8]}",
        time_window_start=time_start,
        time_window_end=time_end,
        total_raw_logs_processed=max(len(events_summary) * 5, 10),
        anomalous_events_count=len(events_summary),
        correlated_events_count=len(events_summary),
        reduction_ratio_pct=85.0,
        primary_suspect_subsystem="kernel",
        events=events_summary,
    )

    # Perform LLM analysis (with retry and Pydantic validation)
    analysis = await analyze_root_cause(context)

    # Update incident fields
    inc.root_cause_summary = analysis.cause
    inc.confidence = analysis.confidence

    # Clear previous evidence and suggestions for fresh analysis
    inc.evidence_list.clear()
    inc.troubleshooting_suggestions.clear()

    # Persist validated evidence items citing exact event IDs
    for item in analysis.evidence:
        inc.evidence_list.append(
            EvidenceModel(
                id=str(uuid.uuid4()),
                incident_id=incident_id,
                log_event_id=item.log_event_id,
                explanation_snippet=item.explanation_snippet,
            )
        )

    # Persist copy-only troubleshooting guidance commands
    for cmd in analysis.troubleshooting_commands:
        inc.troubleshooting_suggestions.append(
            TroubleshootingSuggestionModel(
                id=str(uuid.uuid4()),
                incident_id=incident_id,
                command_text=cmd.command_text,
                rationale=cmd.rationale,
            )
        )

    await db.commit()

    # Return updated detail
    return await get_incident(incident_id, db)


@router.get(
    "/{incident_id}/troubleshooting",
    response_model=List[TroubleshootingSuggestionRead],
    responses={404: {"model": ErrorEnvelope}},
)
async def get_troubleshooting(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Part [B] Endpoint: Fetch copy-only troubleshooting guidance for an incident.
    """
    inc = await _load_incident(incident_id, db)
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INCIDENT_NOT_FOUND", "message": f"Incident '{incident_id}' not found"},
        )

    return [
        TroubleshootingSuggestionRead.model_validate(s)
        for s in inc.troubleshooting_suggestions
    ]
