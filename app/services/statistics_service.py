from datetime import date, timedelta, datetime
from sqlalchemy import func
from sqlmodel import Session, select

from app.db.schema import PomodoroSession, SessionTagLink, Tag
from app.models.session import SessionStatus
from app.models.statistics import DailyStats, StatisticsRead


class StatisticsService:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: int, tag: str | None = None) -> StatisticsRead:
        base_conditions = [
            PomodoroSession.user_id == user_id,
            PomodoroSession.status == SessionStatus.completed,
        ]

        def with_tag(q):
            if tag is not None:
                return q.join(SessionTagLink).join(Tag).where(Tag.name == tag)
            return q

        # Ask the database for the totals
        agg_query = with_tag(
            select(
                func.count(PomodoroSession.id),
                func.coalesce(func.sum(PomodoroSession.duration_minutes), 0),
            ).where(*base_conditions)
        )
        total_sessions, total_minutes = self.db.exec(agg_query).one()
        avg_minutes = round(total_minutes / total_sessions) if total_sessions > 0 else 0

        # Only fetch the last 30 days of rows for the bar chart
        today = date.today()
        cutoff = datetime(today.year, today.month, today.day) - timedelta(days=29)
        recent_query = with_tag(
            select(PomodoroSession).where(
                *base_conditions,
                PomodoroSession.started_at >= cutoff,
            )
        )
        recent_sessions = self.db.exec(recent_query).all()

        # Build the 30-day map (insertion order is already chronological)
        daily_map: dict[str, dict] = {}
        for i in range(30):
            d = (today - timedelta(days=29 - i)).isoformat()
            daily_map[d] = {"date": d, "minutes": 0, "sessions": 0}

        for s in recent_sessions:
            d = s.started_at.date().isoformat()
            if d in daily_map:
                daily_map[d]["minutes"] += s.duration_minutes
                daily_map[d]["sessions"] += 1

        daily = [DailyStats(**v) for v in daily_map.values()]

        return StatisticsRead(
            total_sessions=total_sessions,
            total_minutes=total_minutes,
            avg_minutes=avg_minutes,
            daily=daily,
        )
