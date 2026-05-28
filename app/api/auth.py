from fastapi import APIRouter, Response
from sqlmodel import Session

from app.db.schema import engine
from app.models.user import UserCreate
from app.services.auth_service import UserService
from app.core.config import config

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_MAX_AGE = 30 * 60  # 30 minutes


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=config.app_env != "development",
        samesite="strict",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


@router.post("/register", status_code=201)
def register(new_user: UserCreate, response: Response):
    with Session(engine) as db:
        token = UserService(db).register_user(new_user)
    _set_auth_cookie(response, token)
    return {"message": "Registration successful"}


@router.post("/login")
def login(user: UserCreate, response: Response):
    with Session(engine) as db:
        token = UserService(db).login_user(user)
    _set_auth_cookie(response, token)
    return {"message": "Login successful"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out"}
