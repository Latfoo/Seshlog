from sqlmodel import SQLModel, create_engine, Field, Relationship
from typing import Optional, List
from datetime import datetime

from app.core.config import config
from app.models.session import SessionStatus


# Database setup
engine = create_engine(config.database_url, echo=True)

# This is the link table that connects sessions and tags (many-to-many)
class SessionTagLink(SQLModel, table=True):
    """Join table that links sessions to tags (many-to-many). Not used directly in code."""
    session_id: Optional[int] = Field(default=None, foreign_key="pomodorosession.id", primary_key=True)
    tag_id: Optional[int] = Field(default=None, foreign_key="tag.id", primary_key=True)


class Tag(SQLModel, table=True):
    """A label that can be attached to multiple sessions."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    sessions: List["PomodoroSession"] = Relationship(back_populates="tags", link_model=SessionTagLink)


class PomodoroSession(SQLModel, table=True):
    """A single pomodoro work session stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="usertable.id", index= True)
    task_label: str
    duration_minutes: int
    started_at: datetime = Field(default_factory=datetime.now)
    status: SessionStatus = Field(default=SessionStatus.in_progress)
    tags: List[Tag] = Relationship(back_populates="sessions", link_model=SessionTagLink)


class UserTable(SQLModel, table=True):
    """A table to store user credentials."""
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    