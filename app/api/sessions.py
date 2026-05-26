from fastapi import APIRouter, Depends, Path, Query
from sqlmodel import Session
from typing import Optional, List

from app.db.schema import engine
from app.models.session import PomodoroSessionCreate, PomodoroSessionUpdate, PomodoroSessionRead
from app.services.session_service import SessionService
from app.core.security import get_current_user


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=PomodoroSessionRead, status_code=201)
def create_session(data: PomodoroSessionCreate, user_id: int = Depends(get_current_user)):
    with Session(engine) as db:
        return SessionService(db).create(data, user_id)


@router.get("", response_model=List[PomodoroSessionRead])
def list_sessions(
    tag: Optional[str] = Query(default=None, description="Filter by tag name"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return SessionService(db).list(tag, user_id)


@router.get("/{session_id}", response_model=PomodoroSessionRead)
def get_session(
    session_id: int = Path(..., gt=0, description="ID of the session to retrieve"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return SessionService(db).get(session_id, user_id)


@router.patch("/{session_id}", response_model=PomodoroSessionRead)
def update_session(
    data: PomodoroSessionUpdate,
    session_id: int = Path(..., gt=0, description="ID of the session to update"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return SessionService(db).update(session_id, data, user_id)


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int = Path(..., gt=0, description="ID of the session to delete"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        SessionService(db).delete(session_id, user_id)
