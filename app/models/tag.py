from pydantic import BaseModel
import re

_TAG_PATTERN = re.compile(r'^[a-z0-9][a-z0-9\-_]*$')


def _clean_tags(tags: list[str]) -> list[str]:
    """Lowercase, strip whitespace, and validate each tag name."""
    result = []
    for raw in tags:
        tag = raw.strip().lower()
        if not tag:
            continue  # skip blank entries
        if len(tag) > 50:
            raise ValueError("Each tag must be 50 characters or fewer")
        if not _TAG_PATTERN.match(tag):
            raise ValueError(
                f"Invalid tag '{tag}'. Tags may only contain letters, digits, hyphens, and underscores"
            )
        result.append(tag)
    return result


class TagRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
