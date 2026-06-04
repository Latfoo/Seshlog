from dotenv import load_dotenv
from pydantic import BaseModel
import os

# Load environment variables from the .env file into os.environ.
load_dotenv()


class Config(BaseModel):
    app_name: str = "Seshlog"
    app_description: str = "Backend for a focus session tracker with tagging"
    debug: bool = False
    SECRET_KEY: str = os.environ["SECRET_KEY"]          # used to sign JWTs, must be kept secret
    app_env: str = os.getenv("APP_ENV", "production")   # "development" disables secure cookies
    db_user: str = os.environ["DB_USER"]
    db_password: str = os.environ["DB_PASSWORD"]
    db_name: str = os.environ["DB_NAME"]
    db_host: str = os.getenv("DB_HOST", "localhost")
    TOKEN_EXPIRE_MINUTES: int = 30

    @property
    def database_url(self) -> str:
        """Build the PostgreSQL connection string from the individual env vars."""
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:5432/{self.db_name}"


config = Config()
