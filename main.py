from fastapi import FastAPI, HTTPException
from sqlmodel import SQLModel, create_engine, Session, Field
from dotenv import load_dotenv

from typing import Optional
from datetime import datetime

import os


load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, echo=True)


class PomodoroSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    task_label: str
    duration_minutes: int
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed: bool = False


app = FastAPI(title="Pomodoro Backend", description="A backend for a pomodoro timer application")

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

@app.get("/")
def read_root():
    return {"message": "This is the pomodoro backend!"}


@app.get("/health")
def read_health():
    return {"status": "healthy"}

@app.post("/sessions")
def create_session(new_session: PomodoroSession):
    with Session(engine) as db:
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        return new_session
