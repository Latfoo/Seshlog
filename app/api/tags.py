from fastapi import APIRouter
from sqlmodel import Session
from typing import List

from app.db.schema import engine
from app.models.tag import TagRead
from app.services.tag_service import TagService


router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=List[TagRead])
def list_tags():
    with Session(engine) as db:
        return TagService(db).list()
