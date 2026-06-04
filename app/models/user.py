from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    """Data required to register or log in."""
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        if not isinstance(v, str):
            raise ValueError("Email must be a string.")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number.")
        return v


class UserLogin(BaseModel):
    """Credentials submitted to the login endpoint. No format rules — bcrypt decides."""
    email: str
    password: str


class User(BaseModel):
    """A user as returned by the API."""
    id: int
    email: str
