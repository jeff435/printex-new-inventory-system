import enum
import uuid
from sqlalchemy import (
    Column, String, Boolean, Text, Integer, Numeric,
    ForeignKey, Enum as SAEnum, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class ProductStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DISCONTINUED = "discontinued"


class StockStatus(str, enum.Enum):
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"


# ── Categories ───────────────────────────────────────────────────────────────

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    parent_id = Column(UUID(as_uuid=False), ForeignKey(
        "categories.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    parent = relationship(
        "Category", remote_side="Category.id", back_populates="children")
    children = relationship("Category", back_populates="parent")
    products = relationship("Product", back_populates="category")


class Brand(Base):
    __tablename__ = "brands"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True, index=True)
    logo_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)

    products = relationship("Product", back_populates="brand")


# ── Products ─────────────────────────────────────────────────────────────────

class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    sku = Column(String(100), nullable=False, unique=True, index=True)
    barcode = Column(String(100), nullable=True, unique=True, index=True)
    name = Column(String(500), nullable=False)
    slug = Column(String(500), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    short_description = Column(String(500), nullable=True)

    # ── Printex part identity ────────────────────────────────────────────────
    # The manufacturer's part number as written in the handwritten register
    # (e.g. "M2.184.1111/05", "F-229817"). Not unique: the register lists the
    # same number under different descriptions, and a few lines have none at
    # all, so this cannot carry a UNIQUE constraint — `sku` is the identity.
    part_number = Column(String(100), nullable=True, index=True)

    # Which page of the original register this part came from (A–F). Kept so
    # the imported data can always be traced back to the source photographs.
    register_column = Column(String(1), nullable=True, index=True)

    # Transcription caveats for this specific line — unclear handwriting,
    # revised prices, cross-references. Surfaced to staff in the admin UI so
    # nobody has to re-read the photos to know a value is doubtful.
    register_note = Column(Text, nullable=True)

    # Categorisation
    category_id = Column(UUID(as_uuid=False), ForeignKey(
        "categories.id"), nullable=True)
    brand_id = Column(UUID(as_uuid=False), ForeignKey(
        "brands.id"), nullable=True)

    # ── Pricing ──────────────────────────────────────────────────────────────
    # Two INDEPENDENT currencies, deliberately. Printex buys parts abroad in
    # US Dollars and sells them locally in Kenya Shillings, and the register
    # records both as separate figures — the shilling price is NOT a converted
    # dollar price. There is no exchange rate anywhere in this system and none
    # should ever be added: converting one into the other would silently
    # destroy the real margin.
    #
    # Both are stored as integer minor units (cents) to avoid float rounding.
    #   price_kes            = 1_240_000  → KSh 12,400.00
    #   buying_price_usd     =      3_000 → USD 30.00
    price_kes = Column(Integer, nullable=False)
    # original price (for showing discount)
    compare_price_kes = Column(Integer, nullable=True)
    # purchase cost in USD cents (admin only — never shown to customers)
    buying_price_usd = Column(Integer, nullable=True)

    # True when the register recorded no selling price for this part. The part
    # still exists and is still counted in stock, but it cannot be sold until
    # someone prices it — enforced in the order service, not just the UI.
    needs_pricing = Column(Boolean, default=False, nullable=False)

    # Physical
    weight_grams = Column(Integer, nullable=True)
    unit = Column(String(50), nullable=True)             # kg, pcs, litre, pack
    unit_value = Column(Numeric(10, 3), nullable=True)   # e.g. 2 (for 2 kg)

    # Media
    # [{"url": "...", "alt": "..."}]
    images = Column(JSONB, default=list)
    thumbnail_url = Column(String(500), nullable=True)

    # Metadata
    # ["gluten-free", "organic"]
    tags = Column(JSONB, default=list)
    nutritional_info = Column(JSONB, nullable=True)
    allergens = Column(JSONB, default=list)
    is_age_restricted = Column(Boolean, default=False)   # alcohol, tobacco
    min_age = Column(Integer, nullable=True)             # 18 for alcohol
    is_online_exclusive = Column(Boolean, default=False)
    is_private_label = Column(Boolean, default=False)    # Printex own-brand

    status = Column(SAEnum(ProductStatus),
                    default=ProductStatus.ACTIVE, nullable=False)

    # Ratings — denormalised aggregate, rewritten by app.ratings on every write.
    # Kept here rather than computed per request because product listings are
    # the hottest read path in the app and an AVG/GROUP BY join on each one
    # degrades as the ratings table grows.
    rating_avg = Column(Numeric(3, 2), nullable=True)
    rating_count = Column(Integer, default=0, nullable=False)

    # Relationships
    category = relationship("Category", back_populates="products")
    brand = relationship("Brand", back_populates="products")
    inventory_items = relationship("InventoryItem", back_populates="product")
    order_items = relationship(
        "OrderItem", foreign_keys="[OrderItem.product_id]", back_populates="product")
    ratings = relationship(
        "ProductRating", back_populates="product", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_products_name_search", "name"),
        Index("ix_products_category_status", "category_id", "status"),
    )


# ── Inventory ────────────────────────────────────────────────────────────────

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id", ondelete="CASCADE"), nullable=False)

    quantity_on_hand = Column(Integer, default=0, nullable=False)
    quantity_reserved = Column(
        Integer, default=0, nullable=False)  # in-progress orders
    reorder_point = Column(Integer, default=10,
                           nullable=False)     # alert threshold
    reorder_quantity = Column(
        Integer, default=50, nullable=False)  # suggested PO qty
    # shelf/aisle reference
    bin_location = Column(String(100), nullable=True)

    stock_status = Column(SAEnum(StockStatus),
                          default=StockStatus.OUT_OF_STOCK, nullable=False)

    product = relationship("Product", back_populates="inventory_items")
    branch = relationship("Branch", back_populates="inventory_items")

    __table_args__ = (
        # One record per product per branch
        Index("uq_inventory_product_branch",
              "product_id", "branch_id", unique=True),
    )

    @property
    def available_quantity(self):
        return max(0, self.quantity_on_hand - self.quantity_reserved)

    def update_stock_status(self):
        avail = self.available_quantity
        if avail <= 0:
            self.stock_status = StockStatus.OUT_OF_STOCK
        elif avail <= self.reorder_point:
            self.stock_status = StockStatus.LOW_STOCK
        else:
            self.stock_status = StockStatus.IN_STOCK


# ── Stock movements ──────────────────────────────────────────────────────────

class StockMovementReason(str, enum.Enum):
    GOODS_RECEIVED = "goods_received"   # new stock arrived
    SALE = "sale"                       # deducted by an invoice
    RETURN = "return"                   # customer returned an item
    STOCK_TAKE = "stock_take"           # physical count correction
    DAMAGE = "damage"                   # written off
    OPENING_BALANCE = "opening_balance"  # initial import from the register


class StockMovement(Base):
    """Append-only ledger of every change to stock on hand.

    The original Printex system moved stock in two places (purchase receipts
    up, invoices down) and kept no record of either, so a wrong stock figure
    could not be explained after the fact. Every write to
    `InventoryItem.quantity_on_hand` should also append a row here.

    Rows are never updated or deleted — a mistake is corrected by writing an
    opposing movement, which keeps the history honest.
    """
    __tablename__ = "stock_movements"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id", ondelete="CASCADE"), nullable=False, index=True)

    # Signed: positive adds stock, negative removes it.
    quantity_delta = Column(Integer, nullable=False)
    # Stock on hand immediately after this movement, so the ledger can be read
    # without replaying every prior row.
    quantity_after = Column(Integer, nullable=False)

    reason = Column(SAEnum(StockMovementReason), nullable=False)
    # Free-text pointer to whatever caused it — an invoice number, a delivery
    # note, a stock-take reference.
    reference = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)

    # Which staff member did it. Nullable because the register import has no
    # human author.
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=True)

    product = relationship("Product")

    __table_args__ = (
        Index("ix_stock_movements_product_created",
              "product_id", "created_at"),
    )
