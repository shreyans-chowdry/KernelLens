"""
KernelLens AI — Incidents API Routes
GET   /api/v1/incidents          — Paginated incident list (newest first)
GET   /api/v1/incidents/{id}     — Full incident detail with evidence & commands
PATCH /api/v1/incidents/{id}/status — Update incident status
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.entities import IncidentModel, EvidenceModel, TroubleshootingSuggestionModel
from backend.app.models.schemas import IncidentRead

router = APIRouter(prefix="/incidents", tags=["Incidents"])


class StatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(active|resolved)$")


@router.get("", response_model=List[IncidentRead])
async def list_incidents(
    status: Optional[str] = Query(None, description="Filter: active or resolved"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Paginated incidents, newest first, with evidence and suggestions eagerly loaded."""
    query = (
        select(IncidentModel)
        .options(
            selectinload(IncidentModel.evidence_list),
            selectinload(IncidentModel.troubleshooting_suggestions),
        )
        .order_by(desc(IncidentModel.created_at))
    )

    if status:
        query = query.where(IncidentModel.status == status)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    incidents = result.scalars().unique().all()
    return incidents


@router.get("/count")
async def get_incident_count(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Total incident count, optionally filtered by status."""
    query = select(func.count(IncidentModel.id))
    if status:
        query = query.where(IncidentModel.status == status)
    result = await db.execute(query)
    return {"count": result.scalar() or 0}


@router.get("/{incident_id}", response_model=IncidentRead)
async def get_incident_detail(incident_id: str, db: AsyncSession = Depends(get_db)):
    """Full incident detail: root cause, confidence, evidence, troubleshooting commands."""
    query = (
        select(IncidentModel)
        .options(
            selectinload(IncidentModel.evidence_list),
            selectinload(IncidentModel.troubleshooting_suggestions),
        )
        .where(IncidentModel.id == incident_id)
    )
    result = await db.execute(query)
    incident = result.scalar_one_or_none()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return incident


@router.patch("/{incident_id}/status", response_model=IncidentRead)
async def update_incident_status(
    incident_id: str,
    body: StatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update incident status (active ↔ resolved)."""
    query = (
        select(IncidentModel)
        .options(
            selectinload(IncidentModel.evidence_list),
            selectinload(IncidentModel.troubleshooting_suggestions),
        )
        .where(IncidentModel.id == incident_id)
    )
    result = await db.execute(query)
    incident = result.scalar_one_or_none()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = body.status
    await db.commit()
    await db.refresh(incident)
    return incident
