from fastapi import APIRouter
from sqlmodel import Session

from app.db.schema import engine
from app.models.user import UserCreate
from app.models.token import TokenResponse
from app.services.auth_service import UserService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(new_user: UserCreate):
    with Session(engine) as db:
        return UserService(db).register_user(new_user)


@router.post("/login", response_model=TokenResponse)
def login(user: UserCreate):
    with Session(engine) as db:
        return UserService(db).login_user(user)
