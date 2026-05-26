import logging
from sqlmodel import Session, select

from app.db.schema import SessionTagLink, Tag

logger = logging.getLogger(__name__)


class TagService:
    """Handles database operations for tags."""

    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[Tag]:
        """Return only tags that are attached to at least one session."""
        used_tag_ids = select(SessionTagLink.tag_id)
        tags = self.db.exec(
            select(Tag).where(Tag.id.in_(used_tag_ids))
        ).all()
        logger.debug("Listed %d tags", len(tags))
        return tags
