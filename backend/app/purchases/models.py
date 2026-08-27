import enum
import uuid
from sqlalchemy import (
    Column, String, Boolean, Text, Integer, Numeric,
    ForeignKey, Enum as SAEnum, DateTime
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    contact_person = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)

    purchases = relationship("Purchase", back_populates="supplier")


class PurchaseStatus(str, enum.Enum):
    DRAFT = "draft"        # being entered, stock not yet affected
    RECEIVED = "received"  # goods received — stock has been added
    CANCELLED = "cancelled"


class Purchase(Base):
    """A stock purchase / restock from a supplier. On transition to RECEIVED
    each line item adds stock to the branch and writes a StockMovement row
    (reason=GOODS_RECEIVED, reference=purchase_number)."""
    __tablename__ = "purchases"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    purchase_number = Column(String(50), nullable=False, unique=True, index=True)
    supplier_id = Column(UUID(as_uuid=False), ForeignKey(
        "suppliers.id"), nullable=False)
    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id"), nullable=False)
    status = Column(SAEnum(PurchaseStatus, values_callable=lambda x: [e.value for e in x]),
                     default=PurchaseStatus.DRAFT, nullable=False)
    total_amount = Column(Numeric(12, 2), default=0)
    notes = Column(Text, nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=True)

    supplier = relationship("Supplier", back_populates="purchases")
    items = relationship(
        "PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")

    @property
    def supplier_name(self):
        return self.supplier.name if self.supplier else None


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    purchase_id = Column(UUID(as_uuid=False), ForeignKey(
        "purchases.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product")

    @property
    def product_name(self):
        return self.product.name if self.product else None

    @property
    def product_sku(self):
        return self.product.sku if self.product else None

    @property
    def product_part_number(self):
        return self.product.part_number if self.product else None


class ExpenseCategory(str, enum.Enum):
    RENT = "rent"
    UTILITIES = "utilities"
    TRANSPORT = "transport"
    SALARIES = "salaries"
    OFFICE_SUPPLIES = "office_supplies"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class Expense(Base):
    """Operating expenses — separate from stock purchases, feeds the
    Director's analytics dashboard alongside purchase/sale figures."""
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id"), nullable=True)
    category = Column(SAEnum(ExpenseCategory),
                       default=ExpenseCategory.OTHER, nullable=False)
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    incurred_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=True)
