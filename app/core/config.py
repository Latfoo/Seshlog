from dotenv import load_dotenv
from pydantic import BaseModel
import os

load_dotenv()


class Config(BaseModel):
    app_name: str = "Pomodoro Tracker"
    app_description: str = "Backend for a pomodoro timer with tagging"
    debug: bool = False
    SECRET_KEY: str = os.environ["SECRET_KEY"]
    app_env: str = os.getenv("APP_ENV", "production")
    db_user: str = os.environ["DB_USER"]
    db_password: str = os.environ["DB_PASSWORD"]
    db_name: str = os.environ["DB_NAME"]
    db_host: str = os.getenv("DB_HOST", "localhost")
    TOKEN_EXPIRE_MINUTES: int = 30

    @property
    def database_url(self) -> str:
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:5432/{self.db_name}"


config = Config()
