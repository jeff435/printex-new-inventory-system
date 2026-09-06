import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class AdminAIMemory(Base):
    """A single fact, preference, or habit the assistant has learned about
    how a specific director/secretary/admin likes to work — e.g. "always
    round prices to the nearest 50", "prefers Excel over PDF", "usually
    orders from Nairobi Hydraulics first". Saved explicitly via the
    save_memory tool, or when the user says something like "remember
    that...".

    This is what makes the assistant improve over time instead of starting
    from zero every session — the Redis chat history in admin_ai.router
    expires after an hour and is wiped on restart; this table doesn't.
    Every memory is scoped to the specific user who created it, not shared
    system-wide — what one secretary teaches it doesn't change what the
    assistant says to a director.
    """
    __tablename__ = "admin_ai_memories"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
