from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

from app.models.tag import TagRead, _clean_tags


class SessionStatus(str, Enum):
    in_progress = "in_progress"
    completed = "completed"
    paused = "paused"


class PomodoroSessionCreate(BaseModel):
    task_label: str = Field(min_length=1, max_length=200)
    duration_minutes: int = Field(ge=1, le=480)
    tags: List[str] = Field(default=[], max_length=20)

    @field_validator("task_label")
    @classmethod
    def strip_task_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Task label cannot be blank")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        return _clean_tags(v)


class PomodoroSessionUpdate(BaseModel):
    task_label: Optional[str] = Field(default=None, min_length=1, max_length=200)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=480)
    status: Optional[SessionStatus] = None
    tags: Optional[List[str]] = Field(default=None, max_length=20)

    @field_validator("task_label")
    @classmethod
    def strip_task_label(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Task label cannot be blank")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        return _clean_tags(v)


class PomodoroSessionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    task_label: str
    duration_minutes: int
    started_at: datetime
    status: SessionStatus
    tags: List[TagRead] = []
