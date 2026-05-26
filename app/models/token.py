from pydantic import BaseModel


class TokenResponse(BaseModel):
    """A JWT token returned after login or registration."""
    access_token: str
    token_type: str = "bearer"
