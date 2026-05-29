from pydantic import BaseModel


class DailyStats(BaseModel):
    date: str
    minutes: int
    sessions: int


class StatisticsRead(BaseModel):
    total_sessions: int
    total_minutes: int
    avg_minutes: int
    daily: list[DailyStats]
