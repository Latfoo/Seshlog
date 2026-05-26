import logging
from fastapi import HTTPException
from sqlmodel import Session, select

from app.db.schema import SessionTagLink, Tag, PomodoroSession
from app.models.session import PomodoroSessionCreate, PomodoroSessionUpdate

logger = logging.getLogger(__name__)


class SessionService:
    """Handles all database operations for pomodoro sessions."""

    def __init__(self, db: Session):
        self.db = db

    def _get_or_create_tags(self, tag_names: list[str]) -> list[Tag]:
        """Look up each tag by name, create it if it doesn't exist yet."""
        tags = []
        for name in tag_names:
            existing_tag = self.db.exec(select(Tag).where(Tag.name == name)).first()
            if existing_tag:
                tags.append(existing_tag)
            else:
                new_tag = Tag(name=name)
                self.db.add(new_tag)
                self.db.flush()  # write to DB so the new tag gets an ID before we continue
                tags.append(new_tag)
        return tags

    def create(self, data: PomodoroSessionCreate, user_id: int) -> PomodoroSession:
        """Create a new session, creating any new tags along the way."""
        tags = self._get_or_create_tags(data.tags)
        new_session = PomodoroSession(
            user_id=user_id,
            task_label=data.task_label,
            duration_minutes=data.duration_minutes,
            tags=tags,
        )
        self.db.add(new_session)
        self.db.commit()
        self.db.refresh(new_session)
        _ = new_session.tags  # load tags into memory before session closes
        return new_session

    def list(self, tag: str | None = None, user_id: int = 0) -> list[PomodoroSession]:
        """Return all sessions belonging to the user, optionally filtered by tag."""
        query = select(PomodoroSession).where(PomodoroSession.user_id == user_id)
        if tag is not None:
            # join through the link table to filter by tag name
            query = query.join(SessionTagLink).join(Tag).where(Tag.name == tag)
        sessions = self.db.exec(query).all()
        for s in sessions:
            _ = s.tags  # load tags into memory before session closes
        return sessions

    def _get_owned_session(self, session_id: int, user_id: int) -> PomodoroSession:
        """Fetch a session and verify the requesting user owns it. Raises 404 either way."""
        session = self.db.get(PomodoroSession, session_id)
        if not session or session.user_id != user_id:
            logger.warning("Session %d not found for user %d", session_id, user_id)
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    def get(self, session_id: int, user_id: int) -> PomodoroSession:
        """Fetch a single session by ID. Raises 404 if it does not exist or belong to the user."""
        session = self._get_owned_session(session_id, user_id)
        _ = session.tags  # load tags into memory before session closes
        return session

    def update(self, session_id: int, data: PomodoroSessionUpdate, user_id: int) -> PomodoroSession:
        """Apply partial updates to a session. Raises 404 if it does not exist or belong to the user."""
        session = self._get_owned_session(session_id, user_id)

        if data.task_label is not None:
            session.task_label = data.task_label
        if data.duration_minutes is not None:
            session.duration_minutes = data.duration_minutes
        if data.status is not None:
            session.status = data.status
        if data.tags is not None:
            session.tags = self._get_or_create_tags(data.tags)

        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        _ = session.tags  # load tags into memory before session closes
        return session

    def delete(self, session_id: int, user_id: int) -> None:
        """Delete a session and its tag links. Raises 404 if it does not exist or belong to the user."""
        session = self._get_owned_session(session_id, user_id)
        # Remove link table rows first so orphaned tags don't linger in the filter bar
        links = self.db.exec(select(SessionTagLink).where(SessionTagLink.session_id == session_id)).all()
        for link in links:
            self.db.delete(link)
        self.db.delete(session)
        self.db.commit()
