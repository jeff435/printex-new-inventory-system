import enum
import uuid
from sqlalchemy import (
    Column, String, Text, Integer, Numeric,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class ProformaStatus(str, enum.Enum):
    DRAFT = "draft"          # still being put together, editable
    SENT = "sent"            # handed to the customer for review
    ACCEPTED = "accepted"    # customer has agreed to the quoted terms
    EXPIRED = "expired"      # valid_until has passed, unconverted
    CONVERTED = "converted"  # turned into a real order/sale
    VOID = "void"            # cancelled, never actioned


class ProformaInvoice(Base):
    """A quote issued ahead of a sale — drafted mainly by secretaries, with
    directors and the super admin able to see and work every one raised
    across the business (not just their own)."""

    __tablename__ = "proforma_invoices"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    # Human-facing reference, e.g. "PI-000042". Generated server-side.
    pi_number = Column(String(20), nullable=False, unique=True, index=True)

    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(20), nullable=True)
    customer_email = Column(String(255), nullable=True)

    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id"), nullable=True)

    status = Column(SAEnum(ProformaStatus),
                     default=ProformaStatus.DRAFT, nullable=False, index=True)
    notes = Column(Text, nullable=True)

    # ISO date string — kept as a simple string like OTPCode.expires_at
    # elsewhere in this codebase, rather than a typed date column.
    valid_until = Column(String(50), nullable=True)

    # Integer minor units (KES cents), same convention as Product.price_kes.
    subtotal_kes = Column(Integer, nullable=False, default=0)

    # Discount applied to the subtotal before VAT. Percentage is what staff
    # enter; the KES amount is stored alongside it so a PI still reads
    # correctly even if nobody recalculates it later.
    discount_pct = Column(Numeric(5, 2), nullable=False, default=0)
    discount_kes = Column(Integer, nullable=False, default=0)

    # Always computed server-side as 16% of (subtotal - discount) — Kenya's
    # standard VAT rate. Never accepted from the client; see VAT_RATE in
    # app.proforma.router. Kept as a column (not derived at read time) so a
    # PDF/Excel export of an old PI still shows the rate that applied when it
    # was raised, even if VAT_RATE is ever amended by law in future.
    tax_kes = Column(Integer, nullable=False, default=0)
    total_kes = Column(Integer, nullable=False, default=0)

    created_by_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])
    branch = relationship("Branch")
    items = relationship(
        "ProformaInvoiceItem", back_populates="invoice",
        cascade="all, delete-orphan", order_by="ProformaInvoiceItem.created_at",
    )


class ProformaInvoiceItem(Base):
    __tablename__ = "proforma_invoice_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    proforma_invoice_id = Column(UUID(as_uuid=False), ForeignKey(
        "proforma_invoices.id", ondelete="CASCADE"), nullable=False)

    # Optional link back to the catalogue; description is always stored so
    # the line still reads correctly even if the product is later renamed
    # or removed.
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id"), nullable=True)
    description = Column(String(500), nullable=False)

    quantity = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price_kes = Column(Integer, nullable=False, default=0)
    line_total_kes = Column(Integer, nullable=False, default=0)

    invoice = relationship("ProformaInvoice", back_populates="items")
    product = relationship("Product")
