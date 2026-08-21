import uuid
from sqlalchemy import (
    Column, String, Boolean, Text, Integer, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Customer(Base):
    """A person or firm Printex sells to.

    Deliberately NOT the same thing as `User`. A `User` is someone who signs
    in — a member of staff, or a retail customer with an online account. A
    `Customer` is a billing party on an invoice, and most of them will never
    have a login: the workshop serves walk-in trade who give a name over the
    counter and pay on the spot.

    Modelling these as one table would mean either inventing fake user
    accounts for every walk-in, or being unable to invoice them at all. So
    `orders.customer_id` points here and is always set, while
    `orders.user_id` records which staff member (or which signed-in shopper)
    actually raised the order.

    When a signed-in shopper places an order, a Customer row is created for
    them and linked back via `user_id`, so their counter purchases and their
    online purchases land on the same account and the same balance.
    """
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    name = Column(String(255), nullable=False, index=True)
    company = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    address = Column(Text, nullable=True)
    kra_pin = Column(String(20), nullable=True)  # needed on a tax invoice
    notes = Column(Text, nullable=True)

    # Optional link to a login account, when this customer shops online.
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="SET NULL"), nullable=True, unique=True, index=True)

    # ── Denormalised running figures ─────────────────────────────────────────
    # Outstanding amount owed, in KES cents. Increased when an unpaid invoice
    # is raised, decreased when payment confirms. Floored at zero — a customer
    # who overpays is not owed a negative debt, that is a credit note and a
    # separate concern.
    balance_kes = Column(Integer, default=0, nullable=False)
    order_count = Column(Integer, default=0, nullable=False)

    # Auto-created customers come from a name typed into an invoice rather
    # than a deliberate "add customer" action. Flagged so staff can find and
    # tidy the half-populated records later.
    is_auto_created = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    orders = relationship("Order", back_populates="customer")

    __table_args__ = (
        Index("ix_customers_name_company", "name", "company"),
    )
