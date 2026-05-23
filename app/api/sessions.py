from fastapi import APIRouter, Path, Query
from sqlmodel import Session
from typing import Optional, List

from app.db.schema import engine
from app.models.session import PomodoroSessionCreate, PomodoroSessionUpdate, PomodoroSessionRead
from app.services.session_service import SessionService


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=PomodoroSessionRead, status_code=201)
def create_session(data: PomodoroSessionCreate):
    with Session(engine) as db:
        return SessionService(db).create(data)


@router.get("", response_model=List[PomodoroSessionRead])
def list_sessions(tag: Optional[str] = Query(default=None, description="Filter by tag name")):
    with Session(engine) as db:
        return SessionService(db).list(tag)


@router.get("/{session_id}", response_model=PomodoroSessionRead)
def get_session(session_id: int = Path(..., gt=0, description="ID of the session to retrieve")):
    with Session(engine) as db:
        return SessionService(db).get(session_id)


@router.patch("/{session_id}", response_model=PomodoroSessionRead)
def update_session(
    data: PomodoroSessionUpdate,
    session_id: int = Path(..., gt=0, description="ID of the session to update")
):
    with Session(engine) as db:
        return SessionService(db).update(session_id, data)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int = Path(..., gt=0, description="ID of the session to delete")):
    with Session(engine) as db:
        SessionService(db).delete(session_id)
