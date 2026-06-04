from sqlmodel import Session, select
from fastapi import HTTPException
from app.models.user import UserCreate, UserLogin
from app.db.schema import UserTable
from app.core.security import create_token
import bcrypt
import logging

logger = logging.getLogger(__name__)


class UserService():

    def __init__(self, db: Session):
        self.db = db

    def _get_user_by_email(self, email: str) -> UserTable | None:
        """Look up a user row by email address. Returns None if not found."""
        return self.db.exec(select(UserTable).where(UserTable.email == email)).first()

    def register_user(self, new_user: UserCreate) -> str:
        """Create a new account and return a JWT. Raises 400 if the email is already taken."""
        existing_user = self._get_user_by_email(new_user.email)
        if existing_user:
            logger.warning("Registration failed: email already in use (%s)", new_user.email)
            raise HTTPException(status_code=400, detail="A user with this email already exists.")

        # Hash the password before storing it. bcrypt generates a unique salt automatically.
        s = bcrypt.gensalt()
        h = bcrypt.hashpw(new_user.password.encode('utf-8'), s).decode('utf-8')

        user = UserTable(email=new_user.email, hashed_password=h)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        logger.info("New user registered: %s", new_user.email)
        return create_token(user.id)

    def login_user(self, user: UserLogin) -> str:
        """Verify credentials and return a JWT. Raises 401 for any invalid combination."""
        existing_user = self._get_user_by_email(user.email)
        if not existing_user:
            logger.warning("Login failed: no account for email (%s)", user.email)
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        if bcrypt.checkpw(user.password.encode('utf-8'), existing_user.hashed_password.encode('utf-8')):
            logger.info("User logged in: %s", user.email)
            return create_token(existing_user.id)

        logger.warning("Login failed: wrong password for user %s", user.email)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
