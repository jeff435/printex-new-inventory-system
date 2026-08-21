import enum
import uuid
from sqlalchemy import (
    Column, String, Text, Integer, Numeric,
    ForeignKey, Enum as SAEnum, DateTime
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class ProformaStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    CONVERTED = "converted"   # accepted quote turned into a real stock deduction
    CANCELLED = "cancelled"


class ProformaInvoice(Base):
    """A quote/proforma invoice. Converting it (DRAFT/SENT/ACCEPTED -> CONVERTED)
    deducts real stock for every line item and writes a StockMovement
    (reason=SALE, reference=invoice_number)."""
    __tablename__ = "proforma_invoices"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    invoice_number = Column(String(50), nullable=False, unique=True, index=True)
    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id"), nullable=False)

    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(20), nullable=True)
    customer_email = Column(String(255), nullable=True)
    customer_address = Column(Text, nullable=True)

    status = Column(SAEnum(ProformaStatus),
                     default=ProformaStatus.DRAFT, nullable=False)
    subtotal = Column(Numeric(12, 2), default=0)
    tax_rate = Column(Numeric(5, 2), default=0)   # e.g. 16.00 for 16% VAT
    tax_amount = Column(Numeric(12, 2), default=0)
    total = Column(Numeric(12, 2), default=0)
    notes = Column(Text, nullable=True)

    converted_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=True)

    items = relationship(
        "ProformaInvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class ProformaInvoiceItem(Base):
    __tablename__ = "proforma_invoice_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    invoice_id = Column(UUID(as_uuid=False), ForeignKey(
        "proforma_invoices.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id"), nullable=False)
    description = Column(String(500), nullable=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("ProformaInvoice", back_populates="items")
    product = relationship("Product")
