from fastapi import FastAPI, HTTPException
from sqlmodel import SQLModel, create_engine, Session, Field
from dotenv import load_dotenv

from typing import Optional
from datetime import datetime

import os

# Database setup
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, echo=True)


# session class definitions
class PomodoroSessionBase(SQLModel):
    task_label: str
    duration_minutes: int


class PomodoroSession(PomodoroSessionBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed: bool = False


class PomodoroSessionCreate(PomodoroSessionBase):
    pass


# FastAPI initialization
app = FastAPI(title="Pomodoro Backend", description="A backend for a pomodoro timer application")


# Create the database tables on startup
@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)


# API endpoints
@app.get("/")
def read_root():
    return {"message": "This is the pomodoro backend!"}

@app.get("/health")
def read_health():
    return {"status": "healthy"}

@app.post("/sessions", status_code=201)
def create_session(data: PomodoroSessionCreate):
    session = PomodoroSession(**data.model_dump())
    with Session(engine) as db:
        db.add(session)
        db.commit()
        db.refresh(session)
        return session
