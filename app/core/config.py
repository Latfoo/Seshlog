from dotenv import load_dotenv
from pydantic import BaseModel
import os

load_dotenv()


class Config(BaseModel):
    app_name: str = "Pomodoro Tracker"
    app_description: str = "Backend for a pomodoro timer with tagging"
    debug: bool = False
    db_user: str = os.getenv("DB_USER", "")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_name: str = os.getenv("DB_NAME", "")

    @property
    def database_url(self) -> str:
        return f"postgresql://{self.db_user}:{self.db_password}@localhost:5432/{self.db_name}"


config = Config()
