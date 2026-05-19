from fastapi import FastAPI, HTTPException, Path, Query
from sqlmodel import SQLModel, create_engine, Session, Field, select, Relationship
from dotenv import load_dotenv
from typing import Optional, List
from datetime import datetime
import os

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


# Database setup
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, echo=True)


# -------------------------------------------------------
# Database models (these map directly to database tables)
# -------------------------------------------------------

# This is the link table that connects sessions and tags (many-to-many)
class SessionTagLink(SQLModel, table=True):
    session_id: Optional[int] = Field(default=None, foreign_key="pomodorosession.id", primary_key=True)
    tag_id: Optional[int] = Field(default=None, foreign_key="tag.id", primary_key=True)


class Tag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    sessions: List["PomodoroSession"] = Relationship(back_populates="tags", link_model=SessionTagLink)


class PomodoroSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    task_label: str
    duration_minutes: int
    started_at: datetime = Field(default_factory=datetime.now)
    completed: bool = False
    tags: List[Tag] = Relationship(back_populates="sessions", link_model=SessionTagLink)


# -------------------------------------------------------
# Schemas (these define what the API accepts / returns)
# -------------------------------------------------------

class TagRead(SQLModel):
    id: int
    name: str


class PomodoroSessionCreate(SQLModel):
    task_label: str
    duration_minutes: int
    tags: List[str] = []      # list of tag names, e.g. ["work", "deep-focus"]


class PomodoroSessionUpdate(SQLModel):
    task_label: Optional[str] = None
    duration_minutes: Optional[int] = None
    completed: Optional[bool] = None
    tags: Optional[List[str]] = None   # replaces all tags on the session


class PomodoroSessionRead(SQLModel):
    id: int
    task_label: str
    duration_minutes: int
    started_at: datetime
    completed: bool
    tags: List[TagRead] = []


# -------------------------------------------------------
# App setup
# -------------------------------------------------------

app = FastAPI(
    title="Pomodoro Backend",
    description="Backend for a pomodoro timer with tagging"
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)


@app.get("/")
def root():
    return FileResponse("static/index.html")


@app.get("/health")
def health():
    return {"status": "healthy"}


# -------------------------------------------------------
# Helper
# -------------------------------------------------------

def get_or_create_tags(db: Session, tag_names: List[str]) -> List[Tag]:
    """Look up each tag by name, create it if it doesn't exist yet."""
    tags = []
    for name in tag_names:
        existing_tag = db.exec(select(Tag).where(Tag.name == name)).first()
        if existing_tag:
            tags.append(existing_tag)
        else:
            new_tag = Tag(name=name)
            db.add(new_tag)
            db.flush()   # write to DB so the new tag gets an ID before we continue
            tags.append(new_tag)
    return tags


# -------------------------------------------------------
# Session endpoints
# -------------------------------------------------------

@app.post("/sessions", response_model=PomodoroSessionRead, status_code=201)
def create_session(data: PomodoroSessionCreate):
    with Session(engine) as db:
        tags = get_or_create_tags(db, data.tags)

        new_session = PomodoroSession(
            task_label=data.task_label,
            duration_minutes=data.duration_minutes,
            tags=tags,
        )

        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        return new_session


@app.get("/sessions", response_model=List[PomodoroSessionRead])
def list_sessions(tag: Optional[str] = Query(default=None, description="Filter by tag name")):
    with Session(engine) as db:
        query = select(PomodoroSession)

        if tag is not None:
            # join through the link table to filter by tag name
            query = query.join(SessionTagLink).join(Tag).where(Tag.name == tag)

        sessions = db.exec(query).all()
        return sessions


@app.get("/sessions/{session_id}", response_model=PomodoroSessionRead)
def get_session(session_id: int = Path(..., gt=0, description="ID of the session to retrieve")):
    with Session(engine) as db:
        session = db.get(PomodoroSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session


@app.patch("/sessions/{session_id}", response_model=PomodoroSessionRead)
def update_session(
    data: PomodoroSessionUpdate,
    session_id: int = Path(..., gt=0, description="ID of the session to update")
):
    with Session(engine) as db:
        session = db.get(PomodoroSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if data.task_label is not None:
            session.task_label = data.task_label

        if data.duration_minutes is not None:
            session.duration_minutes = data.duration_minutes

        if data.completed is not None:
            session.completed = data.completed

        if data.tags is not None:
            session.tags = get_or_create_tags(db, data.tags)

        db.add(session)
        db.commit()
        db.refresh(session)
        return session


@app.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int = Path(..., gt=0, description="ID of the session to delete")):
    with Session(engine) as db:
        session = db.get(PomodoroSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        db.delete(session)
        db.commit()


# -------------------------------------------------------
# Tag endpoints
# -------------------------------------------------------

@app.get("/tags", response_model=List[TagRead])
def list_tags():
    with Session(engine) as db:
        tags = db.exec(select(Tag)).all()
        return tags
