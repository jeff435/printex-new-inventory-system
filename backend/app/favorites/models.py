import uuid
from sqlalchemy import Column, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id", ondelete="CASCADE"), nullable=False)

    user = relationship("User")
    product = relationship("Product")

    __table_args__ = (
        # One favorite record per user per product
        Index("uq_favorites_user_product", "user_id",
              "product_id", unique=True),
    )