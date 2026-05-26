from pydantic import BaseModel


class UserCreate(BaseModel):
    """Data required to register or log in."""
    email: str
    password: str


class User(BaseModel):
    """A user as returned by the API."""
    id: int
    email: str

