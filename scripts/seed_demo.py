#!/usr/bin/env python3
"""
Create a demo user and populate it with realistic past sessions.

Run once on the server after deploying:
    python scripts/seed_demo.py

The script is idempotent — running it twice will not create duplicates.
Demo credentials: demo@example.com / demo1234
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import bcrypt
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select, SQLModel

from app.db.schema import engine, UserTable, PomodoroSession, Tag
from app.models.session import SessionStatus

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"

# (days_ago, hour, duration_minutes, tag_names)
# Spread over the last four weeks to make the stats chart look lived-in.
SESSIONS = [
    (0,  9, 25, ["coding"]),
    (0, 10, 25, ["coding"]),
    (0, 14, 50, ["deep-work"]),
    (1,  9, 25, ["studying"]),
    (1, 10, 25, ["studying"]),
    (1, 11, 25, ["studying"]),
    (1, 15, 25, ["planning"]),
    (2, 10, 50, ["deep-work", "coding"]),
    (2, 14, 25, ["coding"]),
    (3,  9, 25, ["reading"]),
    (3, 10, 25, ["reading"]),
    (5,  9, 25, ["coding"]),
    (5, 10, 25, ["coding"]),
    (5, 14, 25, ["coding"]),
    (6,  9, 25, ["planning"]),
    (7, 10, 50, ["deep-work"]),
    (7, 13, 25, ["coding"]),
    (8,  9, 25, ["studying"]),
    (8, 10, 25, ["studying"]),
    (8, 11, 25, ["studying"]),
    (9, 14, 50, ["deep-work", "coding"]),
    (9, 16, 25, ["coding"]),
    (10, 9, 25, ["reading"]),
    (12, 9, 25, ["coding"]),
    (12, 10, 25, ["coding"]),
    (13, 14, 25, ["planning"]),
    (14, 10, 50, ["deep-work"]),
    (15, 9, 25, ["coding"]),
    (15, 14, 25, ["studying"]),
    (16, 9, 25, ["coding"]),
    (16, 10, 25, ["coding"]),
    (19, 9, 25, ["reading"]),
    (19, 10, 25, ["studying"]),
    (20, 14, 50, ["deep-work", "coding"]),
    (21, 9, 25, ["planning"]),
    (22, 10, 25, ["coding"]),
    (22, 11, 25, ["coding"]),
]


def get_or_create_demo_user(db: Session) -> UserTable:
    existing = db.exec(select(UserTable).where(UserTable.email == DEMO_EMAIL)).first()
    if existing:
        print(f"Demo user already exists (id={existing.id}), skipping creation.")
        return existing

    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(DEMO_PASSWORD.encode(), salt).decode()
    user = UserTable(email=DEMO_EMAIL, hashed_password=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created demo user: {DEMO_EMAIL} (id={user.id})")
    return user


def get_or_create_tag(db: Session, name: str) -> Tag:
    existing = db.exec(select(Tag).where(Tag.name == name)).first()
    if existing:
        return existing
    tag = Tag(name=name)
    db.add(tag)
    db.flush()
    return tag


def seed_sessions(db: Session, user: UserTable) -> None:
    existing = db.exec(
        select(PomodoroSession).where(PomodoroSession.user_id == user.id)
    ).all()
    if existing:
        print(f"Demo user already has {len(existing)} session(s), skipping seed.")
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for days_ago, hour, duration, tag_names in SESSIONS:
        started_at = (now - timedelta(days=days_ago)).replace(
            hour=hour, minute=0, second=0, microsecond=0
        )
        tags = [get_or_create_tag(db, name) for name in tag_names]
        session = PomodoroSession(
            user_id=user.id,
            duration_minutes=duration,
            started_at=started_at,
            status=SessionStatus.completed,
            total_paused_seconds=0,
            tags=tags,
        )
        db.add(session)

    db.commit()
    print(f"Seeded {len(SESSIONS)} sessions for demo user.")


if __name__ == "__main__":
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        user = get_or_create_demo_user(db)
        seed_sessions(db, user)
    print("Done.")
