import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import Response
from sqlmodel import SQLModel
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from fastapi.staticfiles import StaticFiles

from app.core.config import config
from app.core.limiter import limiter
from app.core.logging import setup_logging
from app.db.schema import engine
from app.api import sessions, tags, health, frontend, auth, statistics

setup_logging()
logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    SQLModel.metadata.create_all(engine)
    logger.info("App started")
    yield


app = FastAPI(
    title=config.app_name,
    description=config.app_description,
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityHeadersMiddleware)

app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
app.include_router(sessions.router)
app.include_router(tags.router)
app.include_router(health.router)
app.include_router(frontend.router)
app.include_router(auth.router)
app.include_router(statistics.router)
