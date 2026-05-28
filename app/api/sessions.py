from fastapi import APIRouter, Depends, Path, Query, Request
from sqlmodel import Session
from typing import Optional, List

from app.db.schema import engine
from app.models.session import PomodoroSessionCreate, PomodoroSessionUpdate, PomodoroSessionRead
from app.services.session_service import SessionService
from app.core.security import get_current_user
from app.core.limiter import limiter


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=PomodoroSessionRead, status_code=201)
@limiter.limit("60/minute")
def create_session(request: Request, data: PomodoroSessionCreate, user_id: int = Depends(get_current_user)):
    with Session(engine) as db:
        return SessionService(db).create(data, user_id)


@router.get("", response_model=List[PomodoroSessionRead])
@limiter.limit("200/minute")
def list_sessions(
    request: Request,
    tag: Optional[str] = Query(default=None, description="Filter by tag name"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return SessionService(db).list(tag, user_id)


@router.get("/{session_id}", response_model=PomodoroSessionRead)
@limiter.limit("200/minute")
def get_session(
    request: Request,
    session_id: int = Path(..., gt=0, description="ID of the session to retrieve"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return SessionService(db).get(session_id, user_id)


@router.patch("/{session_id}", response_model=PomodoroSessionRead)
@limiter.limit("60/minute")
def update_session(
    request: Request,
    data: PomodoroSessionUpdate,
    session_id: int = Path(..., gt=0, description="ID of the session to update"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return SessionService(db).update(session_id, data, user_id)


@router.delete("/{session_id}", status_code=204)
@limiter.limit("60/minute")
def delete_session(
    request: Request,
    session_id: int = Path(..., gt=0, description="ID of the session to delete"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        SessionService(db).delete(session_id, user_id)
