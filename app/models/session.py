from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

from app.models.tag import TagRead, _clean_tags


class SessionStatus(str, Enum):
    """The three states a session can be in."""
    in_progress = "in_progress"
    completed = "completed"
    paused = "paused"


class PomodoroSessionCreate(BaseModel):
    """Data required to start a new session. Sent by the client in a POST request."""
    duration_minutes: int = Field(ge=1, le=480)
    tags: List[str] = Field(default=[], max_length=20)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        return _clean_tags(v)


class PomodoroSessionUpdate(BaseModel):
    """Fields that can be changed on an existing session. All fields are optional."""
    status: Optional[SessionStatus] = None
    tags: Optional[List[str]] = Field(default=None, max_length=20)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        return _clean_tags(v)


class PomodoroSessionRead(BaseModel):
    """Shape of a session as returned by the API. Includes tags as objects, not just names."""
    model_config = {"from_attributes": True}

    id: int
    duration_minutes: int
    started_at: datetime
    status: SessionStatus
    paused_at: Optional[datetime] = None
    total_paused_seconds: int = 0
    tags: List[TagRead] = []
