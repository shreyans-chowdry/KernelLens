from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.models.entities import LogEventModel
from backend.app.core.database import AsyncSessionLocal


class LogPersistenceService:
    """
    Handles persisting LogEvent records into PostgreSQL with batching and query utilities.
    """

    @staticmethod
    async def save_event(event: LogEventModel, session: Optional[AsyncSession] = None) -> LogEventModel:
        """
        Persist a single LogEvent entity to PostgreSQL.
        """
        if session is not None:
            session.add(event)
            await session.commit()
            await session.refresh(event)
            return event

        async with AsyncSessionLocal() as db:
            db.add(event)
            await db.commit()
            await db.refresh(event)
            return event

    @staticmethod
    async def save_batch(events: List[LogEventModel], session: Optional[AsyncSession] = None) -> List[LogEventModel]:
        """
        Persist a batch of LogEvent entities efficiently to PostgreSQL.
        """
        if not events:
            return []

        if session is not None:
            session.add_all(events)
            await session.commit()
            return events

        async with AsyncSessionLocal() as db:
            db.add_all(events)
            await db.commit()
            return events

    @staticmethod
    async def get_recent_events(limit: int = 100, session: Optional[AsyncSession] = None) -> List[LogEventModel]:
        """
        Fetch the most recent LogEvent rows ordered by timestamp descending.
        """
        query = select(LogEventModel).order_by(desc(LogEventModel.timestamp)).limit(limit)
        if session is not None:
            res = await session.execute(query)
            return list(res.scalars().all())

        async with AsyncSessionLocal() as db:
            res = await db.execute(query)
            return list(res.scalars().all())

    @staticmethod
    async def get_events_by_template(
        template_id: str,
        limit: int = 100,
        session: Optional[AsyncSession] = None
    ) -> List[LogEventModel]:
        """
        Fetch events belonging to a specific mined template cluster.
        """
        query = (
            select(LogEventModel)
            .where(LogEventModel.template_id == template_id)
            .order_by(desc(LogEventModel.timestamp))
            .limit(limit)
        )
        if session is not None:
            res = await session.execute(query)
            return list(res.scalars().all())

        async with AsyncSessionLocal() as db:
            res = await db.execute(query)
            return list(res.scalars().all())


# Singleton helper functions
persist_log_event = LogPersistenceService.save_event
persist_log_events_batch = LogPersistenceService.save_batch
