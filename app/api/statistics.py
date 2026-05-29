from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session
from typing import Optional

from app.db.schema import engine
from app.models.statistics import StatisticsRead
from app.services.statistics_service import StatisticsService
from app.core.security import get_current_user
from app.core.limiter import limiter


router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("", response_model=StatisticsRead)
@limiter.limit("120/minute")
def get_statistics(
    request: Request,
    tag: Optional[str] = Query(default=None, description="Filter by tag name"),
    user_id: int = Depends(get_current_user),
):
    with Session(engine) as db:
        return StatisticsService(db).get(user_id, tag)
