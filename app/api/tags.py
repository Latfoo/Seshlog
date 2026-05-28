from fastapi import APIRouter, Request
from sqlmodel import Session
from typing import List

from app.db.schema import engine
from app.models.tag import TagRead
from app.services.tag_service import TagService
from app.core.limiter import limiter


router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=List[TagRead])
@limiter.limit("200/minute")
def list_tags(request: Request):
    with Session(engine) as db:
        return TagService(db).list()
