import uuid
from sqlalchemy import Column, ForeignKey, Integer, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class ProductRating(Base):
    """A single user's star rating for a single product.

    One row per user per product — rating again updates the existing row rather
    than inserting a second one, so a user can change their mind freely.
    created_at / updated_at come from Base.
    """

    __tablename__ = "product_ratings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id", ondelete="CASCADE"), nullable=False)

    stars = Column(Integer, nullable=False)

    user = relationship("User")
    # back_populates paired with Product.ratings in app/products/models.py —
    # both sides must declare it or SQLAlchemy raises a mapper config error
    # at startup (not a silent no-op), so this pairing is deliberate.
    product = relationship("Product", back_populates="ratings")

    __table_args__ = (
        # One rating per user per product — enforced in the DB, not just in the
        # router, so a double-submitted request can't create a duplicate.
        Index("uq_product_ratings_user_product",
              "user_id", "product_id", unique=True),
        # Reject out-of-range values at the database level too.
        CheckConstraint("stars >= 1 AND stars <= 5",
                        name="ck_product_ratings_stars_range"),
        # Supports the aggregate recalculation below.
        Index("ix_product_ratings_product", "product_id"),
    )
