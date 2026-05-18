from fastapi import FastAPI, HTTPException, Path
from sqlmodel import SQLModel, create_engine, Session, Field, select
from dotenv import load_dotenv

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


@app.post("/createSession", status_code=201)
def create_session(data: PomodoroSessionCreate):
    new_session = PomodoroSession(**data.model_dump())
    with Session(engine) as db:
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        return new_session
    
    
@app.delete("/deleteSession/{session_id}", status_code=204)
def delete_session(session_id: int = Path(..., description="The ID of the session to delete", gt=0)):
    with Session(engine) as db:
        session = db.get(PomodoroSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        db.delete(session)
        db.commit()


@app.get("/sessions/")
def get_sessions():
    with Session(engine) as db:
        sessions = db.exec(select(PomodoroSession)).all()
        return sessions


@app.get("/sessions/{session_id}")
def get_session(session_id: int = Path(..., description="The ID of the session to retrieve", gt=0)):
    with Session(engine) as db:
        session = db.get(PomodoroSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

