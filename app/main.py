import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlmodel import SQLModel

from fastapi.staticfiles import StaticFiles

from app.core.config import config
from app.core.logging import setup_logging
from app.db.schema import engine
from app.api import sessions, tags, health, frontend

setup_logging()
logger = logging.getLogger(__name__)


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

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(sessions.router)
app.include_router(tags.router)
app.include_router(health.router)
app.include_router(frontend.router)
