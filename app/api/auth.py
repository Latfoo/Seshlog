from fastapi import APIRouter, Request, Response
from sqlmodel import Session

from app.db.schema import engine
from app.models.user import UserCreate
from app.services.auth_service import UserService
from app.core.config import config
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

# How long the auth cookie stays valid (matches TOKEN_EXPIRE_MINUTES in config).
COOKIE_MAX_AGE = 30 * 60  # 30 minutes


def _set_auth_cookie(response: Response, token: str) -> None:
    """Write the JWT into an httpOnly cookie so JavaScript cannot read it directly."""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=config.app_env != "development",  # only send over HTTPS outside of development
        samesite="strict",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


@router.post("/register", status_code=201)
@limiter.limit("10/minute")
def register(request: Request, new_user: UserCreate, response: Response):
    with Session(engine) as db:
        token = UserService(db).register_user(new_user)
    _set_auth_cookie(response, token)
    return {"message": "Registration successful"}


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, user: UserCreate, response: Response):
    with Session(engine) as db:
        token = UserService(db).login_user(user)
    _set_auth_cookie(response, token)
    return {"message": "Login successful"}


@router.post("/logout")
def logout(response: Response):
    # Deleting the cookie is enough to log out since the JWT lives in the cookie.
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out"}
