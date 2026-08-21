import enum
import uuid
from sqlalchemy import Column, String, Boolean, Text, Integer, Numeric, ForeignKey, Enum as SAEnum, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class OrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "pending_payment"
    CONFIRMED = "confirmed"
    PICKING = "picking"
    PACKED = "packed"
    DISPATCHED = "dispatched"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentMethod(str, enum.Enum):
    MPESA = "mpesa"
    CARD = "card"
    WALLET = "wallet"
    CASH_ON_DELIVERY = "cash_on_delivery"


class DeliveryType(str, enum.Enum):
    HOME_DELIVERY = "home_delivery"
    PICKUP = "pickup"


class OrderType(str, enum.Enum):
    """What kind of document this row represents.

    The distinction is not cosmetic — it decides whether stock moves:

      QUOTATION  a price offer. Reserves nothing, deducts nothing, adds
                 nothing to the customer's balance. Can be edited freely.
      INVOICE    a sale. Validates stock, deducts it, and puts the amount on
                 the customer's balance until paid.

    A quotation becomes an invoice by conversion, and that conversion is the
    moment stock actually moves.
    """
    INVOICE = "invoice"
    QUOTATION = "quotation"


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    order_number = Column(String(20), nullable=False, unique=True, index=True)

    # Who raised it — a staff member at the counter, or the shopper online.
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=False)
    # Who is being billed. See app/customers/models.py for why this is
    # separate from user_id.
    customer_id = Column(UUID(as_uuid=False), ForeignKey(
        "customers.id"), nullable=True, index=True)

    branch_id = Column(UUID(as_uuid=False), ForeignKey(
        "branches.id"), nullable=False)
    address_id = Column(UUID(as_uuid=False), ForeignKey(
        "addresses.id"), nullable=True)

    order_type = Column(SAEnum(OrderType),
                        default=OrderType.INVOICE, nullable=False, index=True)
    status = Column(SAEnum(OrderStatus),
                    default=OrderStatus.PENDING_PAYMENT, nullable=False)
    delivery_type = Column(SAEnum(DeliveryType),
                           default=DeliveryType.HOME_DELIVERY)

    # ── Money, all in KES cents ──────────────────────────────────────────────
    # Computed in this order, and the order matters — VAT is charged on the
    # discounted figure, not the gross one:
    #   subtotal   = Σ(qty × unit_price)
    #   discount   = subtotal × discount_pct / 100
    #   vat        = (subtotal − discount) × vat_rate / 100
    #   total      = subtotal − discount + vat + delivery_fee
    subtotal_kes = Column(Integer, nullable=False)
    delivery_fee_kes = Column(Integer, default=0)
    discount_pct = Column(Numeric(5, 2), default=0)
    discount_kes = Column(Integer, default=0)
    # Stored per order rather than read from settings at display time, so a
    # reprinted invoice always shows the rate that was actually charged even
    # if the statutory rate changes later.
    vat_rate = Column(Numeric(5, 2), default=16)
    vat_kes = Column(Integer, default=0)
    loyalty_points_used = Column(Integer, default=0)
    loyalty_discount_kes = Column(Integer, default=0)
    total_kes = Column(Integer, nullable=False)

    # Free-text terms / remarks printed on the document.
    notes = Column(Text, nullable=True)
    # When a quotation was turned into an invoice, and what it became.
    converted_at = Column(String(50), nullable=True)
    converted_to_order_id = Column(UUID(as_uuid=False), nullable=True)
    payment_method = Column(SAEnum(PaymentMethod), nullable=True)
    payment_status = Column(String(50), default="unpaid")
    promo_code = Column(String(50), nullable=True)
    special_instructions = Column(Text, nullable=True)
    delivery_slot_date = Column(String(20), nullable=True)
    delivery_slot_start = Column(String(10), nullable=True)
    delivery_slot_end = Column(String(10), nullable=True)
    confirmed_at = Column(String(50), nullable=True)
    dispatched_at = Column(String(50), nullable=True)
    delivered_at = Column(String(50), nullable=True)
    cancelled_at = Column(String(50), nullable=True)
    cancellation_reason = Column(Text, nullable=True)

    user = relationship("User", back_populates="orders")
    customer = relationship("Customer", back_populates="orders")
    branch = relationship("Branch", back_populates="orders")
    address = relationship("Address", foreign_keys=[address_id])
    items = relationship("OrderItem", back_populates="order",
                         cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order", uselist=False)
    delivery = relationship("Delivery", back_populates="order", uselist=False)

    __table_args__ = (
        Index("ix_orders_user_status", "user_id", "status"),
        Index("ix_orders_branch_status", "branch_id", "status"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    order_id = Column(UUID(as_uuid=False), ForeignKey(
        "orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey(
        "products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price_kes = Column(Integer, nullable=False)
    total_price_kes = Column(Integer, nullable=False)
    substitution_product_id = Column(
        UUID(as_uuid=False), ForeignKey("products.id"), nullable=True)
    substitution_approved = Column(Boolean, nullable=True)
    substitution_note = Column(Text, nullable=True)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", foreign_keys=[
                           product_id], back_populates="order_items")


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    order_id = Column(UUID(as_uuid=False), ForeignKey(
        "orders.id"), nullable=False)
    method = Column(SAEnum(PaymentMethod), nullable=False)
    status = Column(SAEnum(PaymentStatus),
                    default=PaymentStatus.PENDING, nullable=False)
    amount_kes = Column(Integer, nullable=False)
    currency = Column(String(3), default="KES")
    provider_ref = Column(String(255), nullable=True, index=True)
    provider_receipt = Column(String(255), nullable=True)
    provider_response = Column(JSONB, nullable=True)
    mpesa_phone = Column(String(20), nullable=True)
    checkout_request_id = Column(String(255), nullable=True, index=True)
    refund_amount_kes = Column(Integer, default=0)
    refund_ref = Column(String(255), nullable=True)
    refunded_at = Column(String(50), nullable=True)

    order = relationship("Order", back_populates="payment")


class LoyaltyTier(str, enum.Enum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"


class LoyaltyAccount(Base):
    __tablename__ = "loyalty_accounts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, unique=True)
    points_balance = Column(Integer, default=0)
    lifetime_points = Column(Integer, default=0)
    tier = Column(SAEnum(LoyaltyTier), default=LoyaltyTier.BRONZE)

    user = relationship("User", back_populates="loyalty_account")
    transactions = relationship(
        "LoyaltyTransaction", back_populates="loyalty_account")


class LoyaltyTransactionType(str, enum.Enum):
    EARN = "earn"
    REDEEM = "redeem"
    EXPIRE = "expire"
    ADJUST = "adjust"


class LoyaltyTransaction(Base):
    __tablename__ = "loyalty_transactions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    loyalty_account_id = Column(UUID(as_uuid=False), ForeignKey(
        "loyalty_accounts.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(UUID(as_uuid=False), ForeignKey(
        "orders.id"), nullable=True)
    type = Column(SAEnum(LoyaltyTransactionType), nullable=False)
    points = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    description = Column(String(255), nullable=True)

    loyalty_account = relationship(
        "LoyaltyAccount", back_populates="transactions")


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, unique=True)
    balance_kes = Column(Integer, default=0)

    user = relationship("User", back_populates="wallet")
    transactions = relationship("WalletTransaction", back_populates="wallet")


class WalletTransactionType(str, enum.Enum):
    TOP_UP = "top_up"
    PAYMENT = "payment"
    REFUND = "refund"
    ADJUST = "adjust"


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    wallet_id = Column(UUID(as_uuid=False), ForeignKey(
        "wallets.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(UUID(as_uuid=False), ForeignKey(
        "orders.id"), nullable=True)
    type = Column(SAEnum(WalletTransactionType), nullable=False)
    amount_kes = Column(Integer, nullable=False)
    balance_after_kes = Column(Integer, nullable=False)
    reference = Column(String(255), nullable=True)
    description = Column(String(255), nullable=True)

    wallet = relationship("Wallet", back_populates="transactions")


class DeliveryStatus(str, enum.Enum):
    ASSIGNED = "assigned"
    PICKED_UP = "picked_up"
    EN_ROUTE = "en_route"
    DELIVERED = "delivered"
    FAILED = "failed"


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    order_id = Column(UUID(as_uuid=False), ForeignKey(
        "orders.id"), nullable=False, unique=True)
    driver_id = Column(UUID(as_uuid=False),
                       ForeignKey("users.id"), nullable=True)
    status = Column(SAEnum(DeliveryStatus), default=DeliveryStatus.ASSIGNED)
    estimated_arrival = Column(String(50), nullable=True)
    picked_up_at = Column(String(50), nullable=True)
    delivered_at = Column(String(50), nullable=True)
    proof_photo_url = Column(String(500), nullable=True)
    delivery_otp = Column(String(10), nullable=True)
    otp_verified = Column(Boolean, default=False)
    driver_notes = Column(Text, nullable=True)
    failure_reason = Column(Text, nullable=True)

    order = relationship("Order", back_populates="delivery")
