from sqlmodel import Session, select
from fastapi import HTTPException
from app.models.user import UserCreate
from app.db.schema import UserTable
from app.core.security import create_token
import bcrypt
import logging

logger = logging.getLogger(__name__)


class UserService():

    def __init__(self, db: Session):
        self.db = db

    def register_user(self, new_user: UserCreate) -> dict:
        """Registers a new user in the database."""

        existing_user = self.db.exec(select(UserTable).where(UserTable.email == new_user.email)).first()
        if existing_user:
            logger.warning("Registration failed: email already in use (%s)", new_user.email)
            raise HTTPException(status_code=400, detail="A user with this email already exists.")

        s = bcrypt.gensalt()
        h = bcrypt.hashpw(new_user.password.encode('utf-8'), s).decode('utf-8')

        user = UserTable(email=new_user.email, hashed_password=h)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        token = create_token(user.id)
        logger.info(f"New user registered: {new_user.email}")
        return {"access_token": token, "token_type": "bearer"}

    def login_user(self, user: UserCreate) -> dict:
        """Authenticates a user and returns a JWT token if successful."""

        existing_user = self.db.exec(select(UserTable).where(UserTable.email == user.email)).first()
        if not existing_user:
            logger.warning("Login failed: no account for email (%s)", user.email)
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        if bcrypt.checkpw(user.password.encode('utf-8'), existing_user.hashed_password.encode('utf-8')):
            token = create_token(existing_user.id)
            logger.info("User logged in: %s", user.email)
            return {"access_token": token, "token_type": "bearer"}

        logger.warning("Login failed: wrong password for user %s", user.email)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
