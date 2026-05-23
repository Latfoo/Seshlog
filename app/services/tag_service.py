from sqlmodel import Session, select

from app.db.schema import SessionTagLink, Tag


class TagService:
    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[Tag]:
        used_tag_ids = select(SessionTagLink.tag_id)
        tags = self.db.exec(
            select(Tag).where(Tag.id.in_(used_tag_ids))
        ).all()
        return tags
